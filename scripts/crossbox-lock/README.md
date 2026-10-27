# Cross-box lock check

Proves the store lock across two bubblewrap boxes that share the hostname
`omb-box` and each have their own PID, user and network namespaces, as
OpenMausBot bot boxes do. Box A holds the lock; box B's `unlock`, acquire,
`clean` and `prune` must all refuse. After `kill -9` of A, B must acquire at once.

```sh
docker run --rm --privileged \
  -v "$PWD":/src:ro -v "$PWD/scripts/crossbox-lock":/crossbox:ro \
  node:24-bookworm bash /crossbox/run.sh
```
