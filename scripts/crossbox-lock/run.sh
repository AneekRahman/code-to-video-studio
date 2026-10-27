set -eu
apt-get update -qq >/dev/null && apt-get install -y -qq bubblewrap >/dev/null
command -v flock bwrap
mkdir -p /work/studio /work/out/work/outputs/job-1/.attempt-live
(cd /src && tar --exclude=.git --exclude=work --exclude=node_modules -cf - .) | (cd /work/studio && tar -xf -) && (cd /work/studio && corepack enable >/dev/null && COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm install --frozen-lockfile --ignore-scripts >/dev/null 2>&1 && echo DEPS_OK)
BOX="bwrap --unshare-user --unshare-pid --unshare-net --unshare-ipc --unshare-uts --hostname omb-box --die-with-parent --ro-bind /usr /usr --symlink usr/bin /bin --symlink usr/lib /lib --ro-bind /etc /etc --proc /proc --dev /dev --tmpfs /tmp --bind /work /work"
[ -e /lib64 ] && BOX="$BOX --symlink usr/lib64 /lib64"
NODE="node --experimental-strip-types --no-warnings"
$BOX $NODE /work/studio/scripts/crossbox-lock/box-a.ts > /tmp/a.out 2>&1 &
APID=$!
for i in $(seq 1 50); do grep -q A_READY /tmp/a.out && break; sleep 0.2; done
cat /tmp/a.out
cat /work/out/work/outputs/.studio-lock/lease.json; echo
$BOX $NODE /work/studio/scripts/crossbox-lock/box-b.ts while-held
kill -9 $APID; wait $APID 2>/dev/null || true
sleep 0.5
$BOX $NODE /work/studio/scripts/crossbox-lock/box-b.ts after-kill
