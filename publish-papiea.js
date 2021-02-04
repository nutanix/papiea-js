// Shlomi.v
// Trying to use relative npm packages turns out to be hell for when you want to publish your packages. I may simply not be familiar
// with the right way. 
// This file will make a temporary change to each package.json file, pointing the packages at the repositories instead of the relative paths.

var child_process = require('child_process')
var fs = require('fs')

function modify_and_publish(subsystem, change) {
    console.log(`Publishing ${subsystem}:`)
    console.log(`  backing up '${subsystem}/package.json' in '${subsystem}/package.json.backup'`)
    fs.copyFileSync(`${subsystem}/package.json`, `${subsystem}/package.json.backup`)
    console.log(`  Modifying '${subsystem}' location...`)
    let package_json = JSON.parse(fs.readFileSync(`${subsystem}/package.json`))
    change.forEach(p => {
        if (package_json.dependencies[p]) {
            package_json.dependencies[p] = `^${package_json.version}`
        } 
        if (package_json.devDependencies[p]) {
            package_json.devDependencies[p] = `^${package_json.version}`
        }
    });
    
    console.log("  Saving modified file...")
    fs.writeFileSync(`${subsystem}/package.json`, JSON.stringify(package_json, null, 2) , 'utf-8')
    console.log("  Publishing...")
    child_process.execSync(`cd ${subsystem}; npm publish`,{stdio:[0,1,2]})
    console.log("  Restoring from backup...")
    fs.copyFileSync(`${subsystem}/package.json.backup`, `${subsystem}/package.json`);
}

// Publish papiea-core
// This one is simple since it has no dependencies
console.log("Publishing papiea-core...")
child_process.execSync("cd papiea-core; npm publish",{stdio:[0,1,2]})

// Publish the rest..
modify_and_publish('papiea-client', ['papiea-core', 'papiea-backend-utils'])
modify_and_publish('papiea-sdk/typescript', ['papiea-core', 'papiea-client', 'papiea-backend-utils'])
modify_and_publish('papiea-engine', ['papiea-core', 'papiea-backend-utils'])
modify_and_publish('papiea-backend-utils', ['papiea-core'])
