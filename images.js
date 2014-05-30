// Check for the various File API support.
if (window.File && window.FileReader && window.FileList && window.Blob) {
    // Great success! All the File APIs are supported.
} else {
    alert('The File APIs are not fully supported in this browser.');
}

// Connect to a Fadecandy server running on the same computer, on the default port
var socket = new WebSocket('ws://raspberrypi-jcoon:7890');

// Put some connection status text in the corner of the screen
document.getElementById('connectionStatus').innerText = 'Connecting to fcserver...';
socket.onclose = function (event) {
    connectionStatus.innerText = "Not connected to fcserver";
}
socket.onopen = function (event) {
    connectionStatus.innerText = "Connected";
}

var imageIndex = 0;
var imageCount = 0;

function handleFileSelect(evt) {
    var files = evt.target.files; // FileList object

    imageCount = files.length;
    imageIndex = 0;
    currentImageIndex = 0;

    document.getElementById('list').innerHTML = "";

    // Loop through the FileList and render image files as thumbnails.
    for (var i = 0, f; f = files[i]; i++) {

        // Only process image files.
        if (!f.type.match('image.*')) {
            continue;
        }

        var reader = new FileReader();

        // Closure to capture the file information.
        reader.onload = (function (theFile) {
            return function (e) {
                // Render thumbnail.
                var span = document.createElement('span');
                span.innerHTML = ['<img id="image' + imageIndex++ + '" class="thumb" src="', e.target.result,
                                  '" title="', escape(theFile.name), '"/>'].join('');
                document.getElementById('list').insertBefore(span, null);

                if (imageIndex == 1) {
                    loadImage();
                }
            };
        })(f);

        // Read in the image file as a data URL.
        reader.readAsDataURL(f);
    }
}

document.getElementById('files').addEventListener('change', handleFileSelect, false);

var currentImageIndex = 0;

var loadedFirstImage = false;
var elapsed = 0;

function loadImage() {

    if (imageCount < 1) { return; }

    elapsed = 0;

    if (currentImageIndex >= imageCount)
        currentImageIndex = 0;

    console.log("Loading image " + currentImageIndex);

    var img = $('#image' + currentImageIndex)[0];
    var canvas = $('<canvas width="' + img.width + '" height="' + img.height + '"/>')[0];
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext('2d').drawImage(img, 0, 0, img.width, img.height);

    // Try to send a frame of LED data to fcserver
    writeFrameToServer(canvas);

    setTimeout(loadImage, 30);

    //if (imageCount > 1) {
    //    currentImageIndex++;

    //    setTimeout(loadImage, 3000);
    //}
}

function writeFrameToServer(canvas) {
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

    var packet = new Uint8ClampedArray(4 + 1024 * 3);

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

    // Dest position in our packet. Start right after the header.
    var dest = 4;

    var index = 0;

    for (var y = 0; y < 32; y++) {
        for (var x = 0; x < 32; x++) {
            var imageData = canvas.getContext('2d').getImageData(x, y, 1, 1);

            // Copy three bytes to our OPC packet, for Red, Green, and Blue
            packet[dest++] = imageData.data[0];
            packet[dest++] = imageData.data[1];
            packet[dest++] = imageData.data[2];
        }
    }

    socket.send(packet.buffer);
    socket.send(packet.buffer);
}
