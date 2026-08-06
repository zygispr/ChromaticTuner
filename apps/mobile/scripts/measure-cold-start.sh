#!/bin/bash
# Mobile cold-start harness (005 T003).
#
# Measures launch -> first rendered React Native frame, frame-accurately, from a
# simulator screen recording. There is no unified-log marker for the first RN
# frame: FrontBoard's "scene content state changed: ready" fires for the launch
# storyboard, ~400 ms before React has rendered anything.
#
# The three phases are told apart by full-frame luminance statistics:
#   home screen -> bright, high variance (icons, wallpaper)
#   launch storyboard -> near-zero variance (a solid background)
#   first RN frame -> variance rises again (text on that background)
#
# t0 is the first storyboard frame (the app owns the screen); t1 is the first
# frame after it whose variance rises. The gap is what the user waits through.

set -u
BUNDLE=pro.chromatictuner.app
DIR="${COLD_START_OUT:-$(mktemp -d)}"
mkdir -p "$DIR"
RUNS=${1:-5}
HERE="$(cd "$(dirname "$0")" && pwd)"
echo "recordings and per-frame CSVs: $DIR"

for i in $(seq 1 "$RUNS"); do
  MP4="$DIR/run-$i.mp4"
  rm -f "$MP4"

  xcrun simctl terminate booted "$BUNDLE" >/dev/null 2>&1
  sleep 2

  xcrun simctl io booted recordVideo --codec h264 --force "$MP4" >/dev/null 2>&1 &
  REC=$!
  sleep 2

  xcrun simctl launch booted "$BUNDLE" >/dev/null 2>&1
  sleep 6

  kill -INT $REC 2>/dev/null
  wait $REC 2>/dev/null
  sleep 1

  ffprobe -v error -f lavfi -i "movie=$MP4,signalstats" \
    -show_entries frame=pts_time:frame_tags=lavfi.signalstats.YAVG,lavfi.signalstats.YHIGH \
    -of csv=p=0 > "$DIR/run-$i.csv" 2>/dev/null

  python3 "$HERE/measure-cold-start-analyse.py" "$DIR/run-$i.csv" "$i"
done

# `storyboard->content` is the number to compare. `launch->content` is included
# because it is what a user waits through, but simctl's recorder emits frames
# only on change and sometimes coalesces the whole app-open animation into one
# frame; when that happens the two columns collapse to the same value and the
# launch figure for that run is not comparable. The storyboard figure is also
# the interval research D5 lengthens, since the preference read goes in front of
# the root mount and the storyboard is what is on screen until it returns.
