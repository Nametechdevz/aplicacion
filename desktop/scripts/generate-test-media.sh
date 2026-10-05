#!/usr/bin/env bash
# Generates the IPTV-like test media used by VlcPlaybackIntegrationTest (requires ffmpeg).
set -euo pipefail
OUT="${1:-build/test-media}"
mkdir -p "$OUT/hls"
cd "$OUT"
# Live channel: H.264 + AC3 (the codec that often plays silent elsewhere) in MPEG-TS.
ffmpeg -hide_banner -loglevel error -y -f lavfi -i testsrc2=size=640x360:rate=25 -f lavfi -i sine=frequency=440:sample_rate=48000 \
  -t 20 -c:v libx264 -preset ultrafast -g 25 -c:a ac3 -b:a 192k -ac 2 -f mpegts live.ts
ffmpeg -hide_banner -loglevel error -y -i live.ts -c copy -f hls -hls_time 2 -hls_list_size 0 hls/index.m3u8
ffmpeg -hide_banner -loglevel error -y -i live.ts -t 4 -c copy short.ts
# VOD: H.264 + AAC in Matroska.
ffmpeg -hide_banner -loglevel error -y -f lavfi -i testsrc2=size=1280x720:rate=25 -f lavfi -i sine=frequency=660:sample_rate=48000 \
  -t 30 -c:v libx264 -preset ultrafast -c:a aac -f matroska movie.mkv
echo "Test media generated in $(pwd)"
