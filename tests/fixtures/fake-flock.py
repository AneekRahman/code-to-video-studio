#!/usr/bin/env python3
# Stand-in for util-linux `flock -n FILE CMD...` on hosts without it (macOS).
# It takes the same kernel flock, so lock tests exercise real lock semantics.
import fcntl
import os
import sys

if len(sys.argv) < 4 or sys.argv[1] != "-n":
    sys.exit(64)
fd = os.open(sys.argv[2], os.O_RDONLY | os.O_CREAT, 0o600)
try:
    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    sys.exit(1)
os.set_inheritable(fd, True)
os.execvp(sys.argv[3], sys.argv[3:])
