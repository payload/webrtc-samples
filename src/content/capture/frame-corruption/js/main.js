/*
*  Copyright (c) 2016 The WebRTC project authors. All Rights Reserved.
*
*  Use of this source code is governed by a BSD-style license
*  that can be found in the LICENSE file in the root of the source
*  tree.
*/

'use strict';

const srcVideo1 = document.getElementById('srcVideo1');
const outputVideo = document.getElementById('outputVideo');
const contentHintLabel1 = document.getElementById('contentHintLabel1');
const bitrateLabels = document.getElementsByName('bitrateLabel');
const [btn1, btn2, btn3, btn4] = document.getElementsByTagName('button');

const BITRATE = 75; // kbps
const USE_GALLERY = true;
let galleryEnabled = USE_GALLERY;

/** @type MediaStream */
let srcStream1;
/** @type MediaStream */
let outputStream;

/** @type RTCPeerConnection */
let pcA;
/** @type RTCPeerConnection */
let pcB;

async function main() {
  bitrateLabels.forEach(el => el.innerText = BITRATE);

  await new Promise((resolve) => (srcVideo1.onplay = resolve));
  srcStream1 = srcVideo1.captureStream();

  btn1.onclick = flipContentHint;
  btn1.innerText = 'flip content hint';

  btn2.onclick = automaticFlipContentHint;
  btn2.innerText = 'automatic flip content hint';

  btn3.onclick = toggleGallery;
  btn3.innerText = 'toggle gallery recording';
  btn3.classList.toggle('active', galleryEnabled);

  btn4.onclick = clearGallery;
  btn4.innerText = 'clear gallery recording';

  await setupVideoSharing(srcStream1);
  automaticFlipContentHint.call(btn2);
}

main();

function flipContentHint() {
  const track = getSender(pcA).track;
  track.contentHint = track.contentHint === 'detail' ? 'motion' : 'detail';
  contentHintLabel1.innerText = track.contentHint;
}

function automaticFlipContentHint() {
  if (automaticFlipContentHint.interval) {
    automaticFlipContentHint.interval = clearInterval(automaticFlipContentHint.interval);
  } else {
    automaticFlipContentHint.interval = setInterval(flipContentHint, 300);
  }

  this?.classList?.toggle('active', Boolean(automaticFlipContentHint.interval));
}

function toggleGallery() {
  galleryEnabled = !galleryEnabled;
  this?.classList?.toggle('active', galleryEnabled);
}

function clearGallery() {
  const pics = Array.from(document.getElementsByClassName('galleryPicture'));
  pics.forEach(el => el.remove());
}

/* global MediaStreamTrackProcessor, MediaStreamTrackGenerator */
function observeIncomingDecodedFrames(track) {
  const processor = new MediaStreamTrackProcessor(track);
  const generator = new MediaStreamTrackGenerator({kind: 'video'});
  const source = processor.readable;
  const sink = generator.writable;
  const transformer = new TransformStream({transform: processIncomingDecodedFrame});
  source.pipeThrough(transformer).pipeTo(sink);
  return generator;
}

function processIncomingDecodedFrame(frame, controller) {
  if (galleryEnabled) {
    const canvas = document.createElement('canvas');
    canvas.className = 'galleryPicture';
    canvas.width = frame.displayWidth;
    canvas.height = frame.displayHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(frame, 0, 0);
    document.body.appendChild(canvas);
  }
  controller.enqueue(frame);
}

async function setupVideoSharing(stream) {
  pcA = new RTCPeerConnection();
  pcB = new RTCPeerConnection();
  outputStream = await sendAndReceiveVideo(pcA, pcB, stream, {limitBitrate: BITRATE});

  if (USE_GALLERY) {
    const track = getVideoTrack(outputStream);
    const generator = observeIncomingDecodedFrames(track);
    outputVideo.srcObject = new MediaStream([generator]);
  } else {
    outputVideo.srcObject = outputStream;
  }
}

async function sendAndReceiveVideo(/** @type RTCPeerConnection */ pc1, pc2, upstream, options = {}) {
  pc1.onicecandidate = e => pc2.addIceCandidate(e.candidate);
  pc2.onicecandidate = e => pc1.addIceCandidate(e.candidate);
  const downstream = new Promise((resolve) => {
    pc2.ontrack = event => resolve(event.streams[0]);
  });
  const track = getVideoTrack(upstream);
  pc1.addTrack(track, upstream);
  const offer = await pc1.createOffer();
  await pc1.setLocalDescription(offer);
  await pc2.setRemoteDescription(offer);
  const answer = await pc2.createAnswer();
  if (options.limitBitrate) limitBitrate(answer, options.limitBitrate);
  await pc2.setLocalDescription(answer);
  await pc1.setRemoteDescription(answer);
  return downstream;
}

function limitBitrate(answer, bitrate) {
  // Hard-code video bitrate to 50kbps.
  answer.sdp = answer.sdp.replace(/a=mid:(.*)\r\n/g, 'a=mid:$1\r\nb=AS:' + bitrate + '\r\n');
}

function getVideoTrack(stream) {
  return stream.getVideoTracks()[0];
}

function getSender(pc) {
  return pc.getTransceivers()[0].sender;
}
