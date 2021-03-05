#!/usr/bin/env bash
set -e
# This is a script that updates typescript SDK, prints out
# Typescript SDK version, Python commit hash, docker image version
# You use these to update README.md section 'Papiea versions'

circle_num=''
accept=false

function collect_args {

   while [[ $# -gt 0 ]]; do
           case "$1" in
                -circle_num)
                    shift
                    circle_num=$1
                    ;;
                -y)
                    shift
                    accept=true
                    ;;
                *)
                   echo "$1 is not a recognized flag!"
                   return 1;
                   ;;
          esac
          shift
  done

  return 0
}

NPM_REGISTRY=$(npm config list | grep '^registry')
YARN_REGISTRY=$(yarn config get registry)

if [[ "$NPM_REGISTRY" != 'registry = "https://nutanix.jfrog.io/nutanix/api/npm/npm-virtual/"' ]]
then
  echo "Your npm registry is not set to nutanix jfrog!"
  exit 1
fi

if [[ "$YARN_REGISTRY" != "https://nutanix.jfrog.io/nutanix/api/npm/npm-virtual/" ]]
then
  echo "Your yarn registry is not set to nutanix jfrog!"
  exit 1
fi

collect_args "$@" || { echo 'Could not collect args'; exit 1; }

if [[ -z "${CIRCLE_BUILD_NUM}" ]]; then
  if [ -z "$circle_num" ]; then
    echo 'CircleCI build number not specified neither in CIRCLE_BUILD_NUM nor in -circle_num arg.'
    exit 1
  else
    echo 'Using CircleCI build number specified in -circle_num arg'
  fi
else
  echo 'Using CircleCI build number specified in CIRCLE_BUILD_NUM'
  circle_num="${CIRCLE_BUILD_NUM}"
fi

make update_typescript_versions UPD_TYPE="patch" BUILD_NUM="'$circle_num'"

# Build typescript packages
curl -o- -L yarnpkg.com/install.sh | bash
export PATH="$PATH:/root/.yarn/bin"
make

node publish-papiea.js

package_version=$(grep -m 1 'New version' temp_version.txt | sed 's/[a-zA-Z :]*//')

pushd ./papiea-sdk/python
./publish-sdk.sh "$package_version"
popd

./papiea-engine/publish-images-release.py "$package_version" | tee temp_version.txt
docker_version=$(tail -n 1 temp_version.txt)

# sed command is different in BSD (Mac OS) and Linux
# In our case the difference is '-i' flag
# Thus checking the OS type
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' "/Client\/SDK (typescript)/c\\
  | Client/SDK (typescript)  | $package_version |
  " README.md

  sed -i '' "/Client\/SDK (python)/c\\
  | Client/SDK (python)  | $package_version |
  " README.md

  sed -i '' "/Engine (docker)/c\\
  | Engine (docker) | $docker_version |
  " README.md
else
  sed -i "/Client\/SDK (typescript)/c\\
  | Client/SDK (typescript)  | $package_version |
  " README.md

  sed -i "/Client\/SDK (python)/c\\
  | Client/SDK (python)  | $package_version |
  " README.md

  sed -i "/Engine (docker)/c\\
  | Engine (docker) | $docker_version |
  " README.md
fi

echo "Version: $package_version; Circle build number: $circle_num."
# append version with PR link to the CHANGELOG.md
commit_message=$(git log -n 1 --format=%s)
# match #$number in the commit message
pr_number=$(echo "$commit_message" | grep -oE "#[1-9]+\b" | tail -1 | cut -c2-)
changelog_message="- Version $package_version: $commit_message"
# if there is a PR number in the commit
if [[ "$pr_number" -ne "" ]]; then
  changelog_message+=" PR url: $CIRCLE_REPOSITORY_URL/pull/$pr_number"
fi
sed -i "1i $changelog_message" CHANGELOG.md

if [[ "$accept" != true ]]; then
  while true; do
    read -r -p "Commit and push? (y/n) " yn
    case $yn in
        [Yy]* ) break;;
        [Nn]* ) exit 1;;
        * ) echo "Please answer yes or no.";;
    esac
  done
fi

git ls-files . | grep 'package\.json' | xargs git add

git add README.md

git add CHANGELOG.md

git commit -m "[skip ci] Upgrade versions. Engine: $docker_version. Typescript: $package_version. Python: $package_version."

git push -u origin HEAD

echo 'Versions updated successfully!'
