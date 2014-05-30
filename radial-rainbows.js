/*
 * This is a self-contained for controlling Fadecandy from JavaScript.
 * We use the popular Paper.js library for drawing and vector math,
 * and we communicate with the LEDs via a WebSocket connection to fcserver.
 *
 * The fcserver must be running before loading the page.
 * Assumes an 32x32 LED matrix in top-down left-right order is connected
 * to the first channel of an attached Fadecandy board.
 *
 * This example is released into the public domain.
 * Feel free to use it as a starting point for your own projects.
 *
 * BROWSER SUPPORT:
 *   - Firefox: Works really well
 *   - Safari: Unusable. Runs for a few seconds, then stops.
 *   - Chrome: Pretty good, but not as fast as Firefox.
 *
 * 2013 Micah Elizabeth Scott
 */

// Paint the background black
var background = new Path.Rectangle(view.bounds);
background.fillColor = 'black';

// Connect to a Fadecandy server running on the same computer, on the default port
var socket = new WebSocket('ws://raspberrypi-jcoon:7890');

// Put some connection status text in the corner of the screen
var connectionStatus = new PointText(view.bounds.topLeft + new Point(8, 25));
connectionStatus.content = 'Connecting to fcserver...';
connectionStatus.style = {
    fontSize: 20,
    justification: 'left',
    fillColor: 'white'
};
socket.onclose = function (event) {
    connectionStatus.content = "Not connected to fcserver";
    connectionStatus.style.fillColor = '#f44';
}
socket.onopen = function (event) {
    connectionStatus.content = "Connected";
    connectionStatus.style.fillColor = '#4f4';
}

// Figure out which areas of the screen are going to map to our LEDs.
// This example is hardcoded for an 32x32 grid of pixels, organized in a
// left-to-right top-down fashion. Each LED is represented by a small
// marker showing its location in the scene.

var leds = []
for (var y = 0; y < 32; y++) {
    for (var x = 0; x < 32; x++) {
        var spacing = (view.bounds.height - 32) / 32;
        var point = view.center + new Point(spacing * (x - 16), spacing * (y - 16));
        var marker = new Path.Circle({
            center: point,
            radius: spacing * 0.25,
            strokeColor: '#888',
            strokeWidth: 1
        });
        leds.push(marker);
    }
}

// Put the LEDs into a group, which we'll use later when we want to know the
// bounding box around all of the sampling locations.

var ledGroup = new Group(leds);

// Use a Raster object to access the pixels we've drawn. This actually acts as
// a proxy for the canvas, and it doesn't copy any data yet. We won't insert it
// into the scene, otherwise we'd be redundantly drawing what we already drew
// during every frame!

var raster = new Raster({
    canvas: myCanvas,
    insert: false,
    position: view.center
});

function writeFrameToServer() {
    // Create an Open Pixel Control message to control our LEDs.
    // The fcserver socket treats text as JSON messages (Not used in
    // this example) and binary objects as Open Pixel Control packets.
    // The format of these messages are identical to the normal OPC
    // packets defined by openpixelcontrol.org, except that the "length"
    // bytes are reserved and should be sent as zero.
    //
    // OPC messages have a four byte header, indicating the channel, command,
    // and length. We want the "Set Pixel Colors" (0) command on channel 0,
    // so we can safely leave the 4-byte header initialized to zeroes,
    // and simply fill in the pixel data right after that in the buffer.
    //
    // Pixel data starts at offset 4 in the buffer, and we have a Red, Green,
    // and Blue byte for each LED.

    var packet = new Uint8ClampedArray(4 + leds.length * 3);

    if (socket.readyState != 1 /* OPEN */) {
        // The server connection isn't open. Nothing to do.
        return;
    }

    if (socket.bufferedAmount > packet.length) {
        // The network is lagging, and we still haven't sent the previous frame.
        // Don't flood the network, it will just make us laggy.
        // If fcserver is running on the same computer, it should always be able
        // to keep up with the frames we send, so we shouldn't reach this point.
        return;
    }

    // Capture an image of just the rectangle around all of our LEDs.
    var imageData = raster.getImageData(ledGroup.bounds);

    // Dest position in our packet. Start right after the header.
    var dest = 4;

    // Sample the center pixel of each LED
    for (var led = 0; led < leds.length; led++) {

        // Calculate the source position in imageData.
        // First, we find a vector relative to the LED bounding box corner.
        // Then we need to calculate the offset into the imageData array.
        // We need to do this with integer math (|0 coerces to integer quickly).
        // Also, note that imageData uses 4 bytes per pixel instead of 3.

        var srcVector = leds[led].position - ledGroup.bounds.topLeft;
        var src = 4 * ((srcVector.x | 0) + (srcVector.y | 0) * imageData.width);

        // Copy three bytes to our OPC packet, for Red, Green, and Blue
        packet[dest++] = imageData.data[src++];
        packet[dest++] = imageData.data[src++];
        packet[dest++] = imageData.data[src++];
    }

    socket.send(packet.buffer);
}

var point = view.center;

var colors = [];
var cycles = 4;
for (var i = 0, l = 60; i < l; i++) {
    var brightness = 1 - (i / l) * 1.5;
    var hue = i / l * cycles * 360;
    var color = {
        hue: hue,
        saturation: 1,
        brightness: brightness
    };
    colors.push(color);
}

var radius = Math.max(view.size.width, view.size.height) * 0.75;

var path = new Path.Rectangle({
    rectangle: view.bounds,
    fillColor: {
        origin: point,
        destination: point + [radius, 0],
        gradient: {
            stops: colors,
            radial: true
        }
    }
});

var color = path.fillColor;
var gradient = color.gradient;
var mouseDown = false;
var mousePoint = view.center;

function onMouseDown(event) {
    mouseDown = true;
    mousePoint = event.point;
}

function onMouseDrag(event) {
    mousePoint = event.point;
}

function onMouseUp(event) {
    vector.length = 10;
    mouseDown = false;
}

var grow = false;
var vector = new Point(150, 0);

function onFrame() {
    for (var i = 0, l = gradient.stops.length; i < l; i++)
        gradient.stops[i].color.hue -= 20;
    if (grow && vector.length > 300) {
        grow = false;
    } else if (!grow && vector.length < 75) {
        grow = true;
    }
    if (mouseDown) {
        point = point + (mousePoint - point) / 10;
    } else {
        vector.length += (grow ? 1 : -1);
        vector.angle += 5;
    }
    color.highlight = mouseDown ? point : point + vector;

    // Try to send a frame of LED data to fcserver
    writeFrameToServer();
}

function onResize(event) {
    point = view.center;
    path.bounds = view.bounds;
    var color = path.fillColor;
    color.origin = point;
    var radius = Math.max(view.size.width, view.size.height) * 0.75;
    color.destination = point + [radius, 0];
}
