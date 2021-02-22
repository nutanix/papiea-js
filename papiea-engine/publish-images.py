#!/usr/bin/env python3

# This script is used to publish image when pushing any changes
# The image is as follows:
# nutanix-docker.jfrog.io/papiea:
# build_num (e.g. 1337)
import subprocess
import time
from subprocess import Popen, PIPE
import os
import sys

BASE_TAG = "nutanix-docker.jfrog.io/papiea:"

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
