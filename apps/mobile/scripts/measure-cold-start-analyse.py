"""Locate the launch phases in a simulator recording.

YHIGH (the high-percentile luminance of the frame) separates the three phases
cleanly on this app, because the launch storyboard is a flat fill:

    home screen        YHIGH ~165   wallpaper and icons
    launch storyboard  YHIGH ==16   the background token, nothing on it
    first RN frame     YHIGH ==26   text has been drawn

t_launch  first frame that is no longer the home screen
t_splash  first frame of the settled storyboard
t_content first frame after the storyboard with anything drawn on it
"""

import sys

rows = []
with open(sys.argv[1]) as fh:
    for line in fh:
        parts = line.strip().split(",")
        if len(parts) < 3 or not parts[2]:
            continue
        try:
            rows.append((float(parts[0]), float(parts[1]), float(parts[2])))
        except ValueError:
            continue

run = sys.argv[2]
if len(rows) < 10:
    print(f"run {run}: NOT ENOUGH FRAMES ({len(rows)})")
    sys.exit(1)

home = rows[0][2]
flat = min(r[2] for r in rows)

i_launch = next((i for i, r in enumerate(rows) if r[2] < home - 1), None)
i_splash = next((i for i, r in enumerate(rows) if r[2] <= flat), None)
if i_launch is None or i_splash is None:
    print(f"run {run}: phases not found (home={home} flat={flat})")
    sys.exit(1)

i_content = next((i for i in range(i_splash, len(rows)) if rows[i][2] > flat), None)
if i_content is None:
    print(f"run {run}: no content frame after the storyboard")
    sys.exit(1)

t_launch, t_splash, t_content = rows[i_launch][0], rows[i_splash][0], rows[i_content][0]
print(
    f"run {run}: launch->content {(t_content - t_launch) * 1000:6.0f} ms | "
    f"storyboard->content {(t_content - t_splash) * 1000:6.0f} ms | "
    f"YHIGH {home:.0f}->{flat:.0f}->{rows[i_content][2]:.0f}"
)
