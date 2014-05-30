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
    connectionStatus.content = "";
    connectionStatus.style.fillColor = '#4f4';
}

// Figure out which areas of the screen are going to map to our LEDs.
// This example is hardcoded for an 32x32 grid of pixels, organized in a
// left-to-right top-down fashion. Each LED is represented by a small
// marker showing its location in the scene.

var leds = []
for (var y = 0; y < 32; y++) {
    for (var x = 0; x < 32; x++) {
        var spacing = (view.bounds.width - 32) / 32;
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


// Adapted from Flocking Processing example by Daniel Schiffman:
// http://processing.org/learning/topics/flocking.html

var Boid = Base.extend({
    initialize: function (position, maxSpeed, maxForce) {
        var strength = Math.random() * 0.5;
        this.acceleration = new Point();
        this.vector = Point.random() * 2 - 1;
        this.position = position.clone();
        this.radius = 30;
        this.maxSpeed = maxSpeed + strength;
        this.maxForce = maxForce + strength;
        this.amount = strength * 10 + 10;
        this.count = 0;
        this.createItems();
    },

    run: function (boids) {
        this.lastLoc = this.position.clone();
        if (!groupTogether) {
            this.flock(boids);
        } else {
            this.align(boids);
        }
        this.borders();
        this.update();
        this.calculateTail();
        this.moveHead();
    },

    calculateTail: function () {
        var segments = this.path.segments,
			shortSegments = this.shortPath.segments;
        var speed = this.vector.length;
        var pieceLength = 5 + speed / 3;
        var point = this.position;
        segments[0].point = shortSegments[0].point = point;
        // Chain goes the other way than the movement
        var lastVector = -this.vector;
        for (var i = 1; i < this.amount; i++) {
            var vector = segments[i].point - point;
            this.count += speed * 10;
            var wave = Math.sin((this.count + i * 3) / 300);
            var sway = lastVector.rotate(90).normalize(wave);
            point += lastVector.normalize(pieceLength) + sway;
            segments[i].point = point;
            if (i < 3)
                shortSegments[i].point = point;
            lastVector = vector;
        }
        this.path.smooth();
    },

    createItems: function () {
        this.head = new Shape.Ellipse({
            center: [0, 0],
            size: [13, 8],
            fillColor: 'white'
        });

        this.path = new Path({
            strokeColor: 'white',
            strokeWidth: 2,
            strokeCap: 'round'
        });
        for (var i = 0; i < this.amount; i++)
            this.path.add(new Point());

        this.shortPath = new Path({
            strokeColor: 'white',
            strokeWidth: 4,
            strokeCap: 'round'
        });
        for (var i = 0; i < Math.min(3, this.amount) ; i++)
            this.shortPath.add(new Point());
    },

    moveHead: function () {
        this.head.position = this.position;
        this.head.rotation = this.vector.angle;
    },

    // We accumulate a new acceleration each time based on three rules
    flock: function (boids) {
        var separation = this.separate(boids) * 3;
        var alignment = this.align(boids);
        var cohesion = this.cohesion(boids);
        this.acceleration += separation + alignment + cohesion;
    },

    update: function () {
        // Update velocity
        this.vector += this.acceleration;
        // Limit speed (vector#limit?)
        this.vector.length = Math.min(this.maxSpeed, this.vector.length);
        this.position += this.vector;
        // Reset acceleration to 0 each cycle
        this.acceleration = new Point();
    },

    seek: function (target) {
        this.acceleration += this.steer(target, false);
    },

    arrive: function (target) {
        this.acceleration += this.steer(target, true);
    },

    borders: function () {
        var vector = new Point();
        var position = this.position;
        var radius = this.radius;
        var size = view.size;
        if (position.x < -radius) vector.x = size.width + radius;
        if (position.y < -radius) vector.y = size.height + radius;
        if (position.x > size.width + radius) vector.x = -size.width - radius;
        if (position.y > size.height + radius) vector.y = -size.height - radius;
        if (!vector.isZero()) {
            this.position += vector;
            var segments = this.path.segments;
            for (var i = 0; i < this.amount; i++) {
                segments[i].point += vector;
            }
        }
    },

    // A method that calculates a steering vector towards a target
    // Takes a second argument, if true, it slows down as it approaches
    // the target
    steer: function (target, slowdown) {
        var steer,
			desired = target - this.position;
        var distance = desired.length;
        // Two options for desired vector magnitude
        // (1 -- based on distance, 2 -- maxSpeed)
        if (slowdown && distance < 100) {
            // This damping is somewhat arbitrary:
            desired.length = this.maxSpeed * (distance / 100);
        } else {
            desired.length = this.maxSpeed;
        }
        steer = desired - this.vector;
        steer.length = Math.min(this.maxForce, steer.length);
        return steer;
    },

    separate: function (boids) {
        var desiredSeperation = 60;
        var steer = new Point();
        var count = 0;
        // For every boid in the system, check if it's too close
        for (var i = 0, l = boids.length; i < l; i++) {
            var other = boids[i];
            var vector = this.position - other.position;
            var distance = vector.length;
            if (distance > 0 && distance < desiredSeperation) {
                // Calculate vector pointing away from neighbor
                steer += vector.normalize(1 / distance);
                count++;
            }
        }
        // Average -- divide by how many
        if (count > 0)
            steer /= count;
        if (!steer.isZero()) {
            // Implement Reynolds: Steering = Desired - Velocity
            steer.length = this.maxSpeed;
            steer -= this.vector;
            steer.length = Math.min(steer.length, this.maxForce);
        }
        return steer;
    },

    // Alignment
    // For every nearby boid in the system, calculate the average velocity
    align: function (boids) {
        var neighborDist = 25;
        var steer = new Point();
        var count = 0;
        for (var i = 0, l = boids.length; i < l; i++) {
            var other = boids[i];
            var distance = this.position.getDistance(other.position);
            if (distance > 0 && distance < neighborDist) {
                steer += other.vector;
                count++;
            }
        }

        if (count > 0)
            steer /= count;
        if (!steer.isZero()) {
            // Implement Reynolds: Steering = Desired - Velocity
            steer.length = this.maxSpeed;
            steer -= this.vector;
            steer.length = Math.min(steer.length, this.maxForce);
        }
        return steer;
    },

    // Cohesion
    // For the average location (i.e. center) of all nearby boids,
    // calculate steering vector towards that location
    cohesion: function (boids) {
        var neighborDist = 100;
        var sum = new Point();
        var count = 0;
        for (var i = 0, l = boids.length; i < l; i++) {
            var other = boids[i];
            var distance = this.position.getDistance(other.position);
            if (distance > 0 && distance < neighborDist) {
                sum += other.position; // Add location
                count++;
            }
        }
        if (count > 0) {
            sum /= count;
            // Steer towards the location
            return this.steer(sum, false);
        }
        return sum;
    }
});

var heartPath = new Path('M514.69629,624.70313c-7.10205,-27.02441 -17.2373,-52.39453 -30.40576,-76.10059c-13.17383,-23.70703 -38.65137,-60.52246 -76.44434,-110.45801c-27.71631,-36.64355 -44.78174,-59.89355 -51.19189,-69.74414c-10.5376,-16.02979 -18.15527,-30.74951 -22.84717,-44.14893c-4.69727,-13.39893 -7.04297,-26.97021 -7.04297,-40.71289c0,-25.42432 8.47119,-46.72559 25.42383,-63.90381c16.94775,-17.17871 37.90527,-25.76758 62.87354,-25.76758c25.19287,0 47.06885,8.93262 65.62158,26.79834c13.96826,13.28662 25.30615,33.10059 34.01318,59.4375c7.55859,-25.88037 18.20898,-45.57666 31.95215,-59.09424c19.00879,-18.32178 40.99707,-27.48535 65.96484,-27.48535c24.7373,0 45.69531,8.53564 62.87305,25.5957c17.17871,17.06592 25.76855,37.39551 25.76855,60.98389c0,20.61377 -5.04102,42.08691 -15.11719,64.41895c-10.08203,22.33203 -29.54687,51.59521 -58.40723,87.78271c-37.56738,47.41211 -64.93457,86.35352 -82.11328,116.8125c-13.51758,24.0498 -23.82422,49.24902 -30.9209,75.58594z');

var boids = [];
var groupTogether = false;

// Add the boids:
for (var i = 0; i < 30; i++) {
    var position = Point.random() * view.size;
    boids.push(new Boid(position, 10, 0.05));
}


function onFrame(event) {
    for (var i = 0, l = boids.length; i < l; i++) {
        if (groupTogether) {
            var length = ((i + event.count / 30) % l) / l * heartPath.length;
            var point = heartPath.getPointAt(length);
            if (point)
                boids[i].arrive(point);
        }
        boids[i].run(boids);
    }

    // Try to send a frame of LED data to fcserver
    writeFrameToServer();
}

// Reposition the heart path whenever the window is resized:
function onResize(event) {
    heartPath.fitBounds(view.bounds);
    heartPath.scale(0.8);
}

function onMouseDown(event) {
    groupTogether = !groupTogether;
}

function onKeyDown(event) {
    if (event.key == 'space') {
        var layer = project.activeLayer;
        layer.selected = !layer.selected;
        return false;
    }
}