const express = require("express");
const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
const fs = require("fs");
const url = require("url");

const app = express();
const port = 3000;

// Global variable to track the transcoding process
let transcodingProcess = null;

// API to start transcoding an M3U8 URL
app.get("/transcode", (req, res) => {
  const { m3u8Url } = req.query;

  // Ensure the m3u8Url is provided
  if (!m3u8Url) {
    return res.status(400).json({ error: "m3u8Url is required." });
  }

  // If transcoding is already running, skip the process
  if (transcodingProcess) {
    return res
      .status(400)
      .json({ error: "Transcoding process is already running." });
  }

  // Generate channel name from the m3u8Url (default to last part of the URL path)
  const parsedUrl = url.parse(m3u8Url);
  const channelName =
    parsedUrl.pathname.split("/").pop() || "transcoded_stream";

  // Output file paths for transcoded stream
  const outputDir = path.join(__dirname, "output");
  const outputPlaylist = path.join(outputDir, `${channelName}_output.m3u8`);
  const outputSegmentsDir = path.join(outputDir, "segments");

  // Ensure the output directory and segments folder exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }
  if (!fs.existsSync(outputSegmentsDir)) {
    fs.mkdirSync(outputSegmentsDir);
  }

  // Start the transcoding process
  transcodingProcess = ffmpeg(m3u8Url)
    .audioCodec("ac3") // Set the audio codec to AC3
    .audioBitrate("640k") // Set the audio bitrate
    .videoCodec("libx264") // Set the video codec to x264
    .format("hls") // Output format: HLS (HTTP Live Streaming)
    .outputOptions([
      "-hls_time 10", // Segment duration (in seconds)
      "-hls_playlist_type event", // Playlist type for continuous streaming
      `-hls_segment_filename ${path.join(
        outputSegmentsDir,
        "segment_%03d.ts"
      )}`, // Segment file naming pattern
    ])
    .on("end", () => {
      console.log(`Transcoding finished for channel: ${channelName}`);
      transcodingProcess = null; // Reset transcoding process when done
    })
    .on("error", (err) => {
      console.error(`Error transcoding channel: ${channelName}`, err);
      transcodingProcess = null; // Reset transcoding process on error
      res.status(500).json({ error: "Error during transcoding" });
    })
    .output(outputPlaylist)
    .run();

  // Dynamically create the stream URL based on the request protocol and host
  const streamUrl = `${req.protocol}://${req.get(
    "host"
  )}/output/${channelName}_output.m3u8`;

  // Return the playable URL to the user
  res.json({ channel: channelName, url: streamUrl });
});

// API to stop the transcoding process
app.get("/stop-transcoding", (req, res) => {
  if (!transcodingProcess) {
    return res.status(400).json({ error: "No transcoding process running." });
  }

  // Terminate the transcoding process
  transcodingProcess.kill();
  transcodingProcess = null;

  res.json({ message: "Transcoding process stopped successfully." });
});

// Serve the output directory (HLS playlist and segments)
app.use("/output", express.static(path.join(__dirname, "output")));

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
