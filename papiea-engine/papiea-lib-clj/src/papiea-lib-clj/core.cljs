(ns papiea-lib-clj.core
  (:require [cljs.nodejs :as nodejs]
            [instaparse.core :as insta])
  (:use [clojure.set :only (rename-keys)]))

(nodejs/enable-util-print!)

(def sfs-parser
  (insta/parser
   "S                = simple-complex     

    (* optimize simple case *)
    <simple-complex> = complex | simple 
    <non-simple>     = vector  | group    

    (* this trick avoids ambiguity *)
    complex          = (simple <'.'>)? c (<'.'> simple)? 

    (* Allows for arbitraty simple/non-simple combination without introducing ambiguity *)
    <c>              = non-simple (<'.'> non-simple)* | (non-simple <'.'>)+ simple (<'.'> c) 

    (* regular flow *)
    group            = <'['> simple-complex (<','> (<' '>)* simple-complex)*  <']'>
    simple           = path 
    <path>           = field (<'.'> field)*
    vector           = (add | del | change) <'{'> path <'}'>
    add              = <'+'>
    del              = <'-'>
    change           = epsilon
    <field>          = #'[a-zA-Z_0-9]+'"))

(defn optimize-ast
  "Optimizer for now simply removes a `complex` node when it consists of
  only a single operation. This was to obfuscated to describe in the parser"
  [ast]
  (insta/transform {;;:S (fn [a] a)
                    :complex (fn[& a] (if (= 1 (count a))
                                        (first a)
                                        (into [:papiea/complex] a)))
                    :simple  (fn[& a] (into [:papiea/simple] a))
                    :vector  (fn[& a] (into [:papiea/vector] a))
                    :group   (fn[& a] (if (= 1 (count a))
                                        (first a)
                                        (into [:papiea/group] a)))} ast))

(defn prepare
  "Prepare a spec/status pair to be diffed by the compiled Differ"
  [spec status]
  [{:keys {} :key :papiea/item :spec-val [spec] :status-val [status]}])

(defn flat-choices
  "Used to flatten embedded multiple choices"
  [x] (if (and (vector? x) (= 1 (count x)) (vector? (first x))) (first x) x))

(defn ensure-vec
  "ensure the item is a vector. If not, turns to vector. Nil is empty vector"
  [x] (cond (nil? x)    []
            (vector? x) x
            :else       [x]))

(defn ensure_vector_action [action {:keys [spec-val status-val]}]
  (condp = action
    [:add] (and (empty? status-val) (seq spec-val))
    [:del] (and (empty? spec-val) (seq status-val))
    [:change] (and (seq spec-val) (seq status-val) (not= spec-val status-val))
    [:all] true
    (throw (js/Error. "Error, dont know what to ensure on vector"))))

(defn get-in'
  "Similar to `core.get-in` but allows for maps with keys that are
  either strings or keywords to be queried using the same `ks` path"
  [m ks]
  (or (get-in m (mapv name ks))
      (get-in m (mapv keyword ks))))

(defn filter-diff [results]
  (filterv #(not= (:spec-val %) (:status-val %)) results))

(defn empty-nil
  "If the sequence is empty, return nil"
  [xs] (if (empty? xs) nil xs))

(defn ensure-some
  "Ensure that a sequence has at least one item. This is used to short
  when looking for matches in vectors"
  [xs] (if (zero? (count xs)) (throw (js/Error. "none found")) xs))

(defmulti sfs-compiler
  "Compile sfs-signature ast, as generated by the parser and optimizer
  by the optimizer. For now the optimizer must be used because of our
  use of namespaced keywords in the AST. Unfortunately there is no way
  to tell instaparse to emit namepsaced keywords yet."
  (fn[x] (first x))) 

;; Node `:S` in the AST is always the top node. This is where the
;; compiled code will be checking that the results actually include a diff.
(defmethod sfs-compiler :S [[_ q]]
  (let [c (sfs-compiler q)]
    (fn[results]
      (try (empty-nil (filter-diff (c results)))
           (catch js/Error e)))))

;; Node `:papiea/simple` in the AST encodes getting a value directly by
;; following a path, essentially a `get-in` like function.
(defmethod sfs-compiler :papiea/simple [[_ & ks]]
  (fn[results]
    (mapv (fn[{:keys [keys key spec-val status-val]}]
            (let [s1 (mapv #(get-in' % ks) spec-val)
                  s2 (mapv #(get-in' % ks) status-val)
                  empty (or (empty? s1) (empty? s2))]
              {:keys keys
               :key (if empty key (last ks))
               :spec-val  (if empty spec-val (flat-choices s1))
               :status-val (if empty status-val (flat-choices s2))}))
          results)))

;; Node `:papiea/vector` in the AST encodes looking inside a vector and grouping
;; the items in a vector based on some `simple` selector.
(defmethod sfs-compiler :papiea/vector [[_ action & ks]]
  (fn[results]
    (into []
          (mapcat (fn[{:keys [keys key spec-val status-val]}]
                    (->> (group-by #(get-in' % ks)
                                   (into
                                    (mapv #(assoc % :papiea/spec true) spec-val) ;; Should use meta instead?
                                    (mapv #(assoc % :papiea/status true) status-val)))
                         (mapv (fn[[id-val [s1 s2]]]
                                 {:keys       (assoc keys (last ks) id-val)
                                  :key        key
                                  :spec-val   (ensure-vec(cond (:papiea/spec s1) (dissoc s1 :papiea/spec)
                                                               (:papiea/spec s2) (dissoc s2 :papiea/spec)
                                                               :else             nil))
                                  :status-val (ensure-vec(cond (:papiea/status s1) (dissoc s1 :papiea/status)
                                                               (:papiea/status s2) (dissoc s2 :papiea/status)
                                                               :else               nil))}))
                         (filterv (partial ensure_vector_action action))
                         ensure-some))
                  results))))

;; Node `:papiea/complex` in the AST recieves various commands that are
;; essentially threaded into eachother. This establishes a "drill-down"
;; mechanism which gets more exact results as we progress through the commands.
;; Essentially each child node of this node will be evaluated in the context
;; returned by the previous node, thus achieving drill down.
(defmethod sfs-compiler :papiea/complex [[_ & cmds]]
  (let [cs (mapv sfs-compiler cmds)]
    (fn[results]
      (reduce (fn[o f] (f o)) results cs))))

(defn subset [a b] (= (select-keys b (keys a)) a))

;; Node `:papiea/group` in the AST marks an intersection of its child
;; nodes. Each one of the child nodes needs to be evaluated in the context of
;; the parent node, and their results are stored in a list. However, we must
;; ensure that all items in a group are matching based on the prior context
;; saved in `:keys`
(defmethod sfs-compiler :papiea/group [[_ & cmds]]
  (let [cs (mapv sfs-compiler cmds)]
    (fn[results]
      ;; Finally managed to come up with a way to group properly:
      (let [;; results contains the id's traversed prior to this `group` branch
            prior-ids (into #{} (map :keys results))
            ;; apply the grouping and work on the results
            rs (mapcat (fn[f] (filter-diff (f results))) cs)] 
        (->> prior-ids
             ;; Look for the prior ids in the new `:keys` after branching
             (map (fn[id] (filter (fn[y] (subset id (:keys y))) rs)))
             ;; Amount matched must be exactly the number of branches,
             ;; each branch identified by the matching key.
             ;; TODO: What if keys have the same values? 
             (filter #(= (count cs) (count (group-by :key %))))
             ;; Remove the grouping
             (apply concat)
             ;; Turn back to vector
             vec)))))

;;; Exporting functionality to javascript land
(defn ^:export clj_str[a]
  (str a))

(defn ^:export parse_sfs[sfs-signature]
  (let [result (insta/parse sfs-parser sfs-signature)]
    (if (some? (insta/get-failure result))
      (throw (js/Error. (with-out-str (prn result))))
      result)))

(defn ^:export optimize_sfs_ast[ast]
  (optimize-ast ast))

(defn ^:export compile_sfs_ast[ast]
  (sfs-compiler ast))

(defn ^:export compile_sfs[sfs-signature]
  (let [sfs-fn (some-> sfs-signature
                       parse_sfs
                       optimize-ast
                       sfs-compiler
                       )]
    (if (fn? sfs-fn) sfs-fn {:error-compiling-sfs :sfs-fn
                             :sfs-signature sfs-signature})))

(defn truncate-val-postfix [result]
  (map #(rename-keys % {:spec-val :spec, :status-val :status}) result))

(defn ^:export run_compiled_sfs[compiled-sfs-fn spec status]
  (let [spec (js->clj spec)
        status (js->clj status)
        results (prepare spec status)]
    (clj->js (truncate-val-postfix (compiled-sfs-fn results)))))

(defn -main [& args]
  (println "Hello world"))

(set! *main-cli-fn* -main)
