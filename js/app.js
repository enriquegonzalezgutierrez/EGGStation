/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Application Layer: EGGStation Entrypoint & Coordinator
 * 
 * Coordinates system execution loops, binds keyboard handlers to Sega I/O pins,
 * schedules frame sync rates, handles debugger interactions, and hosts standard savestates.
 */

// Global hardware instances references
let glbMMU;
let glbCPU;
let glbCartridge;
let glbVDP;
let glbSoundchip;

// FPS tracking variables
let frameTime = 0;
let lastLoop;
let thisLoop;

let glbBpLine = 0;
let glbBreakpoint = -1;
const numDebuggerLines = 20;

// Emulator status: -1: Initialization, 0: Debugger, 1: Active, 2: Paused
let glbEmulatorStatus = -1; 
let glbVideoctx;
let glbMaxSpeed = false;
let glbScheduleInterval = 16;
let glbFrames = 0;
let glbSerializer;
let glbSerCounterL = -1;
let glbSerCounterS = -1;
let glbVdpMode = 0; // 0: NTSC, 1: PAL

/**
 * Reconstitutes and loads the preview snapshot for savestates.
 */
function loadSavestateImage() {
    const uintarr = new Uint8ClampedArray(256 * 240 * 4);
    const imgAsArray = JSON.parse(localStorage.getItem('savestateScreenshot'));
    if (imgAsArray === null) return;

    const canvas2 = document.createElement('canvas');
    canvas2.width = 256;
    canvas2.height = 240;
    const ctx2 = canvas2.getContext('2d');

    let pos = 0;
    for (let y = 0; y < 240; y++) {
        for (let x = 0; x < 256; x++) {
            uintarr[pos] = imgAsArray[pos]; pos++;
            uintarr[pos] = imgAsArray[pos]; pos++;
            uintarr[pos] = imgAsArray[pos]; pos++;
            uintarr[pos] = imgAsArray[pos]; pos++;
        }
    }    

    const imgdata = new ImageData(uintarr, 256, 240);
    ctx2.putImageData(imgdata, 0, 0, 0, 0, 256, 240); 
    
    const targetImage = document.getElementById("savestateImg");
    if (targetImage) {
        targetImage.src = canvas2.toDataURL();
    }
}

/**
 * Renders state parameters and registers onto the HTML5 Debugging board.
 */
function drawDebugPanel(instructions) {
    const ycoordStep = 20;
    let ycoord = 16;
    const canvas = document.getElementById("debugCanvas");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.textRendering = "optimizeLegibility";

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.rect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "white";
    ctx.fill();

    // Active instruction highlighting border
    ctx.beginPath();
    ctx.lineWidth = "1";
    ctx.strokeStyle = "green";
    ctx.rect(0, 0, 310, 20);
    ctx.stroke();    

    ctx.font = "20px monospace";

    for (let i = 0; i < instructions.length; i++) {
        ctx.fillStyle = "black";

        let dbgString = instructions[i].address.toString(16).padStart(4, '0') + " ";
        for (let b = 0; b < 4; b++) {
            if (instructions[i].bytes.length > b) {
                dbgString += instructions[i].bytes[b].toString(16).padStart(2, '0') + " ";
            } else {
                dbgString += "   ";
            }
        }
        dbgString += instructions[i].decodedString;

        if (glbBpLine === i) {
            ctx.fillText(">", 0, ycoord);
        }

        if (glbBreakpoint === instructions[i].address) {
            ctx.fillStyle = "red";
            ctx.fillText("*", 0, ycoord);
        }

        ctx.fillText(dbgString, 20, ycoord);
        ycoord += ycoordStep;
    }

    // CPU registers visualization
    let regYCoord = 16;
    const regxpos = 400;

    ctx.fillStyle = "black";
    ctx.fillText("AF: " + (glbCPU.registers.a).toString(16).padStart(2, '0') + (glbCPU.registers.f).toString(16).padStart(2, '0'), regxpos, regYCoord); regYCoord += 20;
    ctx.fillText("BC: " + (glbCPU.registers.b).toString(16).padStart(2, '0') + (glbCPU.registers.c).toString(16).padStart(2, '0'), regxpos, regYCoord); regYCoord += 20;
    ctx.fillText("DE: " + (glbCPU.registers.d).toString(16).padStart(2, '0') + (glbCPU.registers.e).toString(16).padStart(2, '0'), regxpos, regYCoord); regYCoord += 20;
    ctx.fillText("HL: " + (glbCPU.registers.h).toString(16).padStart(2, '0') + (glbCPU.registers.l).toString(16).padStart(2, '0'), regxpos, regYCoord); regYCoord += 20;
    ctx.fillText("IX: " + (glbCPU.registers.ixh).toString(16).padStart(2, '0') + (glbCPU.registers.ixl).toString(16).padStart(2, '0'), regxpos, regYCoord); regYCoord += 20;
    ctx.fillText("IY: " + (glbCPU.registers.iyh).toString(16).padStart(2, '0') + (glbCPU.registers.iyl).toString(16).padStart(2, '0'), regxpos, regYCoord);

    regYCoord += 40;
    ctx.fillText("SP: " + (glbCPU.registers.sp).toString(16).padStart(4, '0'), regxpos, regYCoord); regYCoord += 20;
    ctx.fillText("PC: " + (glbCPU.registers.pc).toString(16).padStart(4, '0'), regxpos, regYCoord);

    regYCoord += 40;
    ctx.fillText("SZFHFPNC", regxpos, regYCoord); regYCoord += 20;
    ctx.fillText(glbCPU.getFlags(), regxpos, regYCoord);
    
    regYCoord += 40;
    ctx.fillText("DPRW: " + glbVDP.dataPortReadWriteAddress.toString(16).padStart(4, '0'), regxpos, regYCoord);

    regYCoord += 40;
    ctx.fillText("INT Enabled: " + glbCPU.maskableInterruptsEnabled, regxpos, regYCoord);

    // Active memory monitoring window
    let ypp = 20;
    let romAddr = 0x4cc8;

    for (let l = 0; l < 8; l++) {
        let stringy = romAddr.toString(16).padStart(4, '0') + ": ";
        for (let b = 0; b < 8; b++) {
            const byte = glbMMU.readAddr(romAddr);
            stringy += byte.toString(16).padStart(2, '0') + " ";
            romAddr++;
        }
        ctx.fillText(stringy, 500, ypp);
        ypp += 20;
    }
}

function drawFFWDIcon() {
    const cnvs = document.getElementById("smsdisplay");
    const ctx = cnvs.getContext("2d", { willReadFrequently: true });
    ctx.font = '10px sans-serif';
    ctx.fillStyle = 'white';
    ctx.textBaseline = 'top';
    ctx.fillText(">> Fast Forward", 2, 180);        
}

function drawPauseIcon() {
    const cnvs = document.getElementById("smsdisplay");
    const ctx = cnvs.getContext("2d", { willReadFrequently: true });
    ctx.font = '10px sans-serif';
    ctx.fillStyle = 'white';
    ctx.textBaseline = 'top';
    ctx.fillText("|| Paused", 2, 180);        
}

function drawStatus(s) {
    const cnvs = document.getElementById("smsdisplay");
    const ctx = cnvs.getContext("2d", { willReadFrequently: true });
    ctx.font = '10px sans-serif';
    ctx.fillStyle = 'white';
    ctx.textBaseline = 'top';
    ctx.fillText(s, 180, 180);        
}

/**
 * Main execution and timing frame sync loop.
 */
function emulate() {
    let smsFps = 59.922743; // Standard NTSC rate
    if (glbVdpMode === 1) {
        smsFps = 49.701459; // Standard PAL rate
    }

    // Dynamic FPS throttling calculation
    const filterStrength = 20;
    const thisFrameTime = (thisLoop = new Date()) - lastLoop;
    frameTime += (thisFrameTime - frameTime) / filterStrength;
    lastLoop = thisLoop;

    const fpsOut = document.getElementById('fpsSpan');
    const fpeez = (1000 / frameTime).toFixed(1);
    if (fpsOut) {
        fpsOut.innerHTML = fpeez + " FPS";
    }
    glbFrames++;

    // Fine-tune timing schedule bounds
    if ((!glbMaxSpeed) && (glbFrames > 60)) {
        if (fpeez < smsFps) {
            if (glbScheduleInterval > 1) glbScheduleInterval--;
        } else if (fpeez > smsFps) {
            glbScheduleInterval++;
        }
    }

    if (!glbMaxSpeed) {
        setTimeout(emulate, glbScheduleInterval);
    } else {
        setTimeout(emulate, 0);
    }

    if (glbEmulatorStatus === 1) {
        let emulatedCycles = 0;
        const targetCycles = Math.floor(glbCPU.clockRate / smsFps);

        while (emulatedCycles < targetCycles) {
            const cyc = glbCPU.executeOne();
            if (!glbMaxSpeed) {
                glbSoundchip.step(glbCPU.totCycles);
            }
            const needsBlit = glbVDP.update(glbCPU, cyc);

            if (needsBlit) {
                drawScreen();
            }

            emulatedCycles += cyc;
        }
    }
    else if (glbEmulatorStatus === 2) {
        drawScreen();
        drawPauseIcon();
    }
    else if (glbEmulatorStatus === 0) {
        drawScreen();
    }

    if (glbMaxSpeed) {
        drawFFWDIcon();
    }

    if (glbSerCounterL > 0) {
        glbSerCounterL--;
        drawStatus("State Loaded");
    }

    if (glbSerCounterS > 0) {
        glbSerCounterS--;
        drawStatus("State Saved");
    }
}

function drawScreen() {
    if (glbEmulatorStatus === 0) {
        const decodedInstrs = glbCPU.debugInstructions(numDebuggerLines);
        drawDebugPanel(decodedInstrs);
        const canvas = document.getElementById("debugCanvas");
        const ctx = canvas.getContext("2d");
        glbVDP.debugPalette(ctx, 480, 390);
        glbVDP.debugTiles(ctx, 500, 0);
    }

    glbVDP.hyperBlit(glbVideoctx, 0);
}

/**
 * Initializes and wires all system entities under EGGStation workspace.
 */
function loadBinary(fname, abuf) {
    glbCartridge = new SegaMasterSystemCartridge(fname);
    glbCartridge.load(abuf);
    glbVDP = new Sega315_5124_Vdp(glbVdpMode);
    glbSoundchip = new Sega315_5124_Psg();
    glbMMU = new SegaMasterSystemBus(glbCartridge, glbVDP, glbSoundchip);
    glbCPU = new ZilogZ80(glbMMU);
    glbSoundchip.startMix(glbCPU);

    glbEmulatorStatus = 1; // Transition to active running loop
    lastLoop = new Date();
    thisLoop = undefined;
    hideDebugStuff();
    emulate();
}

function setVdpStandard(th) {
	if (th.value === "NTSC") glbVdpMode = 0;
	if (th.value === "PAL") glbVdpMode = 1;
}

function loadSoftware(th) {
	if (th.value === "run") return;

    const oReq = new XMLHttpRequest();
    oReq.open("GET", "roms/" + th.value, true);
    oReq.responseType = "arraybuffer";
    oReq.onload = function() {
        const arrayBuffer = oReq.response;
        loadBinary(th.value, arrayBuffer);
    };
    oReq.send();
}

function handleCartridgeUpload(fls) {
	const fileReader = new FileReader();
	fileReader.onload = function(event) {
		const fname = document.getElementById("cartridgeSelector").value;

		if ((fname.toLowerCase().indexOf(".sms") < 0) && (fname.toLowerCase().indexOf(".sg") < 0) && (fname.indexOf(".") > 0)) {
			alert("EGGStation::Error: System only supports .sms and .sg file extensions.");
			return;
		}

        console.log("EGGStation::Uploading cartridge [" + fname + "]");
		const arrayBuffer = event.target.result;
        loadBinary(fname, arrayBuffer);
	};
	fileReader.readAsArrayBuffer(fls[0]);	
}

function gotoAddress() {
    const addr = document.getElementById("bpaddress").value;
    if (addr === "") return;

    const intAddr = parseInt(addr, 16);
    glbBreakpoint = intAddr;

    while (glbCPU.registers.pc !== glbBreakpoint) {
        const cyc = glbCPU.executeOne();
        glbVDP.update(glbCPU, cyc);
    }
}

function runCPUTests(t) {
    const tstMMU = new Z80DiagnosticMemory();
    const refCPU = new ZilogZ80(tstMMU);

    if (t === 0) {
        for (let o = 0; o < refCPU.unprefixedOpcodes.length; o++) {
            if (refCPU.unprefixedOpcodes[o] !== undefined) {
                new Z80TestSuiteRunner("tests/" + o.toString(16).padStart(2, '0') + ".json");
            }
        }
    }
    else if (t === 0xed) {
        for (let o = 0; o < refCPU.prefixedOpcodes.length; o++) {
            if (refCPU.prefixedOpcodes[o] !== undefined) {
                new Z80TestSuiteRunner("tests/ed " + o.toString(16).padStart(2, '0') + ".json");
            }
        }
    }
    else if (t === 0xdd) {
        for (let o = 0; o < refCPU.prefixddOpcodes.length; o++) {
            if (refCPU.prefixddOpcodes[o] !== undefined) {
                new Z80TestSuiteRunner("tests/dd " + o.toString(16).padStart(2, '0') + ".json");
            }
        }
    }
    else if (t === 0xddcb) {
        for (let o = 0; o < refCPU.prefixddcbOpcodes.length; o++) {
            if (refCPU.prefixddcbOpcodes[o] !== undefined) {
                new Z80TestSuiteRunner("tests/dd cb __ " + o.toString(16).padStart(2, '0') + ".json");
            }
        }
    }
    else if (t === 0xcb) {
        for (let o = 0; o < refCPU.prefixcbOpcodes.length; o++) {
            if (refCPU.prefixcbOpcodes[o] !== undefined) {
                new Z80TestSuiteRunner("tests/cb " + o.toString(16).padStart(2, '0') + ".json");
            }
        }
    }
    else if (t === 0xfd) {
        for (let o = 0; o < refCPU.prefixfdOpcodes.length; o++) {
            if (refCPU.prefixfdOpcodes[o] !== undefined) {
                new Z80TestSuiteRunner("tests/fd " + o.toString(16).padStart(2, '0') + ".json");
            }
        }
    }
    else if (t === 0xfdcb) {
        for (let o = 0; o < refCPU.prefixfdcbOpcodes.length; o++) {
            if (refCPU.prefixfdcbOpcodes[o] !== undefined) {
                new Z80TestSuiteRunner("tests/fd cb __ " + o.toString(16).padStart(2, '0') + ".json");
            }
        }
    }
}

function fullscreen() {
    document.documentElement.requestFullscreen();
}

function fullscreenchanged() {
    const display = document.getElementById("smsdisplay");
    if (document.fullscreenElement) {
        document.getElementById("titleDiv").style.display = "none";
        document.getElementById("fsbutton").style.display = "none";
        document.getElementById("vdpMode").style.display = "none";
        display.style.position = "absolute";
        display.style.width = "100%";
        display.style.height = "125%";
        document.body.style.padding = '0';
        document.body.style.margin = '0';
    } else {
        document.getElementById("titleDiv").style.display = "block";
        document.getElementById("fsbutton").style.display = "block";
        document.getElementById("vdpMode").style.display = "block";
        display.style.position = "relative";
        display.style.width = "768px";
        display.style.height = "720px";
        document.body.style.padding = '5px';
        document.body.style.margin = '5px';
    }
}

function hideDebugStuff() {
    document.getElementById("debugCanvas").style.display = "none";
    document.getElementById("smsdisplay").style.width = "768px";
    document.getElementById("smsdisplay").style.height = "720px";
    document.getElementById("cartridgeSelector").style.display = "none";
    document.getElementById("softLoader").style.display = "none";
    document.getElementById("fileselector").style.display = "none";
    document.getElementById("vdpMode").style.display = "none";
    document.getElementById("fsbutton").style.display = "block";
}

function showDebugStuff() {
    document.getElementById("debugCanvas").style.display = "block";
    document.getElementById("debugButtons").style.display = "block";
    document.getElementById("smsdisplay").style.width = "256px";
    document.getElementById("smsdisplay").style.height = "240px";
}

window.onload = () => {
    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);
    const isDebug = urlParams.get('debug');
    if (isDebug !== null) {
        document.getElementById("debugButtons").style.display = "block";
    }

    loadSavestateImage();

    // Map computer keystrokes to hardware controller states
    document.onkeydown = function(e) {
        if (e.key === "s") {
            showDebugStuff();
            glbEmulatorStatus = 0;
            const cyc = glbCPU.executeOne();
            glbVDP.update(glbCPU, cyc);
            e.preventDefault();
        }
        else if (e.key === "r") {
            let goout = false;
            while ((glbCPU.registers.pc !== glbBreakpoint) && (!goout)) {
                const cyc = glbCPU.executeOne();
                glbVDP.update(glbCPU, cyc);
            }
            e.preventDefault();
        }
        else if (e.key === "g") {
            hideDebugStuff();
            glbEmulatorStatus = 1;
        }
        else if (e.key === "\\") {
            glbMaxSpeed = true;
            e.preventDefault();
        }
        else if (e.key === "p") {
            if (glbEmulatorStatus === 1) glbEmulatorStatus = 2;
            else if (glbEmulatorStatus === 2) glbEmulatorStatus = 1;
        }
        else if (e.key === "o") {
            glbCPU.raiseNMI(); // Execute console PAUSE button cycle via NMI line
        }
        else if (e.key === "F2") {
            glbSerializer.serialize(glbCartridge.cartridgeName, glbCPU, glbVDP, glbMMU, glbSoundchip);
            glbSerCounterS = 60;
            loadSavestateImage();
            e.preventDefault();
        }
        else if (e.key === "F3") {
            if (glbEmulatorStatus === 1) {
                if (glbSerializer.deserialize(glbCartridge.cartridgeName, glbCPU, glbVDP, glbMMU, glbSoundchip) === 0) {
                    glbSerCounterL = 60;
                }
            }
            e.preventDefault();
        }
        else if (e.key === "z") { glbMMU.pressButton1(); }
        else if (e.key === "x") { glbMMU.pressButton2(); }
        else if (e.key === "ArrowDown") { glbMMU.pressDown(); }
        else if (e.key === "ArrowUp") { glbMMU.pressUp(); }
        else if (e.key === "ArrowLeft") { glbMMU.pressLeft(); }
        else if (e.key === "ArrowRight") { glbMMU.pressRight(); }
    };

    document.onkeyup = function(e) {
        if (e.key === "z") { glbMMU.depressButton1(); }
        if (e.key === "x") { glbMMU.depressButton2(); }
        else if (e.key === "ArrowDown") { glbMMU.depressDown(); }
        else if (e.key === "ArrowUp") { glbMMU.depressUp(); }
        else if (e.key === "ArrowLeft") { glbMMU.depressLeft(); }
        else if (e.key === "ArrowRight") { glbMMU.depressRight(); }
        else if (e.key === "\\") {
            glbMaxSpeed = false;
        }
    };

    const canvas = document.getElementById('debugCanvas');
    if (canvas) {
        canvas.addEventListener("mousemove", function (e) {
            if (glbEmulatorStatus !== 0) return;

            const rect = canvas.getBoundingClientRect();
            const mousey = (e.clientY - rect.top);
            const row = Math.floor(mousey / 20);
            glbBpLine = row;
        }, false);

        canvas.addEventListener("mousedown", function (e) {
            if (glbEmulatorStatus !== 0) return; 

            const decodedInstrs = glbCPU.debugInstructions(numDebuggerLines);
            const rect = canvas.getBoundingClientRect();
            const mousey = (e.clientY - rect.top);
            const row = Math.floor(mousey / 20);
            glbBreakpoint = decodedInstrs[row].address;
        });    
    }

    document.addEventListener('fullscreenchange', fullscreenchanged);

    const loaderBtn = document.getElementById('romLoaderBtn');
    if (loaderBtn) {
        loaderBtn.addEventListener('click', () => { 
            document.getElementById('cartridgeSelector').click();
        });
    }

    const videocanvas = document.getElementById("smsdisplay");
    glbVideoctx = videocanvas.getContext("2d");
    glbSerializer = new WebLocalStorageSerializer();
};