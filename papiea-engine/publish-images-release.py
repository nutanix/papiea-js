#!/usr/bin/env python3

# This script is used to publish images when creating new release
# The images are following:
# nutanix-docker.jfrog.io/papiea:
# latest, major, major.minor, major.minor.patch, major.minor.patch+build_num (e.g. build_num - 1337)
import subprocess
import time
from subprocess import Popen, PIPE
import os
import sys

BASE_TAG = "nutanix-docker.jfrog.io/papiea:"


def construct_tags(sem_ver):
    tags = []
    sem_ver_parts = sem_ver.split("+")
    major, minor, patch = sem_ver_parts[0].split(".")
    tags.append("{}latest".format(BASE_TAG))
    tags.append("{}{}".format(BASE_TAG, major))
    tags.append("{}{}.{}".format(BASE_TAG, major, minor))
    tags.append("{}{}.{}.{}".format(BASE_TAG, major, minor, patch))
    try:
        version, build_num = sem_ver_parts[0], sem_ver_parts[1]
        if build_num != os.environ['CIRCLE_BUILD_NUM']:
            raise Exception("Environment variable and version param CI build number mismatch!")
        tags.append("{}{}_{}".format(BASE_TAG, version, build_num))
    except IndexError as e:
        print("No build number present in the version: {}".format(sem_ver), file=sys.stderr)
        pass
    return tags


build_tag = (BASE_TAG + os.environ['CIRCLE_BUILD_NUM'])

subprocess.check_call([
    'docker', 'login',
    'nutanix-docker.jfrog.io',
    '-u', os.environ['ARTIFACTORY_USER'],
    '-p', os.environ['ARTIFACTORY_PASSWORD']])

with open(".dockerignore", "w") as f:
    f.write("!papiea-engine/__tests__/test_data_factory.ts")
    f.write("papiea-engine/__tests__/**/*")
    f.write("papiea-engine/__benchmarks__/**/*")

subprocess.check_call([
    'docker', 'build',
    '-t', build_tag,
    '--cache-from=papiea-engine:debug',
    '-f', '.circleci/Dockerfile',
    '.'])

subprocess.check_call(['docker', 'push', build_tag])
try:
    semantic_version = sys.argv[1]
except IndexError as e:
    print("No semantic version was passed as an argument, aborting", file=sys.stderr)
    sys.exit(1)

tags = construct_tags(semantic_version)
running_procs = []
for tag in tags:
    print("Publishing {}".format(tag), flush=True)
    subprocess.check_call([
        'docker', 'tag', build_tag, tag])
    running_procs.append(Popen(['docker', 'push', tag]))

retcode = None
while running_procs:
    for proc in running_procs:
        retcode = proc.poll()
        if retcode is not None:  # Process finished.
            running_procs.remove(proc)
            break
        else:  # No process is done, wait a bit and check again.
            time.sleep(5)
            continue

    if retcode == 0 or retcode is None:
        continue
    else:
        raise Exception("Couldn't push tags, return code for push was: {}".format(retcode))

# Print 'major.minor.patch+build_num' version so that it could optionally be used
# as an input to bash script
print(tags[-1], flush=True)
