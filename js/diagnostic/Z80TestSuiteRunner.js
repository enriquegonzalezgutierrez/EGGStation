/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Diagnostic Layer: Z80TestSuiteRunner
 * 
 * Implements the functional parsing, verification, and regression-test pipeline
 * designed to run Z80 CPU instruction datasets using mock diagnostic memory.
 */

class Z80TestSuiteRunner {
    /**
     * @param {string} testsPath - Relative URL path pointing to the JSON dataset file.
     */
    constructor(testsPath) {
        this.curTest = testsPath;
        this.theMMU = new Z80DiagnosticMemory();
        this.theCpu = new ZilogZ80(this.theMMU);
    
        this.testsLoaded = false;
        this.testJsonObject = undefined;

        const thisInstance = this;
        const oReq = new XMLHttpRequest();

        oReq.open("GET", testsPath, true);
        oReq.onload = function() {
            const testJson = oReq.response;
            thisInstance.testJsonObject = JSON.parse(testJson);
            thisInstance.testsLoaded = true;
            thisInstance.runTests();
        };
        oReq.send();
    }

    /**
     * Converts a byte value into an 8-bit padded binary string.
     */
    toBinary(n) {
        return n.toString(2).padStart(8, '0');
    }

    /**
     * Iterates over every test definition in the JSON object, validating operations.
     */
    runTests() {
        let numTestsExecuted = 0;
        let numTestsFailed = 0;

        console.log("TestSuiteRunner::Starting test suite [" + this.curTest + "]...");
        
        // Execute up to 1000 standard validation routines inside the file
        for (let testCaseNum = 0; testCaseNum < 1000; testCaseNum++) {
            if (this.testJsonObject[testCaseNum] === undefined) {
                break;
            }

            let testFailed = false;
            
            // Clean up the RAM
            this.theMMU.cleanMem();

            const testCase = this.testJsonObject[testCaseNum];

            // Setup initial memory state defined in the test block
            for (let v = 0; v < testCase.initial.ram.length; v++) {
                this.theMMU.writeAddr(testCase.initial.ram[v][0], testCase.initial.ram[v][1]);
            }

            // Prepare incoming port values if the instruction is port-driven
            if ("ports" in testCase) {
                this.theMMU.preparePort(testCase.ports[0][1]);
            }

            // Inject initial CPU registers states
            this.theCpu.registers.a = testCase.initial.a;
            this.theCpu.shadowRegisters.a = testCase.initial.af_ >> 8;
            this.theCpu.registers.b = testCase.initial.b;
            this.theCpu.shadowRegisters.b = testCase.initial.bc_ >> 8;
            this.theCpu.registers.c = testCase.initial.c;
            this.theCpu.shadowRegisters.c = testCase.initial.bc_ & 0xff;
            this.theCpu.registers.d = testCase.initial.d;
            this.theCpu.shadowRegisters.d = testCase.initial.de_ >> 8;
            this.theCpu.registers.e = testCase.initial.e;
            this.theCpu.shadowRegisters.e = testCase.initial.de_ & 0xff;
            this.theCpu.registers.f = testCase.initial.f;
            this.theCpu.shadowRegisters.f = testCase.initial.af_ & 0xff;
            this.theCpu.registers.h = testCase.initial.h;
            this.theCpu.shadowRegisters.h = testCase.initial.hl_ >> 8;
            this.theCpu.registers.l = testCase.initial.l;
            this.theCpu.shadowRegisters.l = testCase.initial.hl_ & 0xff;
            this.theCpu.registers.r = testCase.initial.r;
            this.theCpu.registers.i = testCase.initial.i;
            
            this.theCpu.registers.iff1 = testCase.initial.iff1;
            this.theCpu.registers.iff2 = testCase.initial.iff2;

            this.theCpu.registers.ixl = testCase.initial.ix & 0xff;
            this.theCpu.registers.ixh = testCase.initial.ix >> 8;
            this.theCpu.registers.iyl = testCase.initial.iy & 0xff;
            this.theCpu.registers.iyh = testCase.initial.iy >> 8;

            this.theCpu.registers.pc = testCase.initial.pc;
            this.theCpu.registers.sp = testCase.initial.sp;

            const expectedCycles = testCase.cycles.length;

            // Execute the single opcode
            const emuCycles = this.theCpu.executeOne();

            // Validate clock execution cycle timing
            if (emuCycles !== expectedCycles) {
                console.warn("TestSuiteRunner::Cycles mismatch! Emulated: " + emuCycles + ", Expected: " + expectedCycles);
            }

            // Validate accumulator results
            if (this.theCpu.registers.a !== testCase.final.a) {
                console.log("TestSuiteRunner::Accumulator mismatch in " + testCase.name +
                    " - Initial A: [0x" + testCase.initial.a.toString(16) +
                    "] | Emulated A: [0x" + this.theCpu.registers.a.toString(16) +
                    "] | Expected A: [0x" + testCase.final.a.toString(16) + "]"
                ); 
                testFailed = true;
            }
            
            // Validate general registers
            if (this.theCpu.registers.b !== testCase.final.b) {
                console.log("TestSuiteRunner::Register B mismatch in " + testCase.name);
                testFailed = true;
            }
            if (this.theCpu.registers.c !== testCase.final.c) {
                console.log("TestSuiteRunner::Register C mismatch in " + testCase.name);
                testFailed = true;
            }
            if (this.theCpu.registers.d !== testCase.final.d) {
                console.log("TestSuiteRunner::Register D mismatch in " + testCase.name);
                testFailed = true;
            }
            if (this.theCpu.registers.e !== testCase.final.e) {
                console.log("TestSuiteRunner::Register E mismatch in " + testCase.name);
                testFailed = true;
            }

            // Validate core flags (mask out undocumented flags F3 and F5 as they are irrelevant for SMS accuracy)
            if ((this.theCpu.registers.f & 0xd7) !== (testCase.final.f & 0xd7)) {
                console.log("TestSuiteRunner::Flags mismatch in " + testCase.name +
                    " | Emulated F: [" + this.toBinary(this.theCpu.registers.f) +
                    "] | Expected F: [" + this.toBinary(testCase.final.f) + "]"
                );
                testFailed = true;
            }

            if (this.theCpu.registers.h !== testCase.final.h) {
                console.log("TestSuiteRunner::Register H mismatch in " + testCase.name);
                testFailed = true;
            }
            if (this.theCpu.registers.l !== testCase.final.l) {
                console.log("TestSuiteRunner::Register L mismatch in " + testCase.name);
                testFailed = true;
            }

            // Validate shadow register state transitions
            if (this.theCpu.shadowRegisters.a !== (testCase.final.af_ >> 8)) {
                console.log("TestSuiteRunner::Register A' mismatch in " + testCase.name);
                testFailed = true;
            }
            if (this.theCpu.shadowRegisters.b !== (testCase.final.bc_ >> 8)) {
                console.log("TestSuiteRunner::Register B' mismatch in " + testCase.name);
                testFailed = true;
            }
            if (this.theCpu.shadowRegisters.c !== (testCase.final.bc_ & 0xff)) {
                console.log("TestSuiteRunner::Register C' mismatch in " + testCase.name);
                testFailed = true;
            }
            if (this.theCpu.shadowRegisters.d !== (testCase.final.de_ >> 8)) {
                console.log("TestSuiteRunner::Register D' mismatch in " + testCase.name);
                testFailed = true;
            }
            if (this.theCpu.shadowRegisters.e !== (testCase.final.de_ & 0xff)) {
                console.log("TestSuiteRunner::Register E' mismatch in " + testCase.name);
                testFailed = true;
            }
            if (this.theCpu.shadowRegisters.h !== (testCase.final.hl_ >> 8)) {
                console.log("TestSuiteRunner::Register H' mismatch in " + testCase.name);
                testFailed = true;
            }
            if (this.theCpu.shadowRegisters.l !== (testCase.final.hl_ & 0xff)) {
                console.log("TestSuiteRunner::Register L' mismatch in " + testCase.name);
                testFailed = true;
            }

            // Validate program counter jumps
            if (this.theCpu.registers.pc !== testCase.final.pc) {
                console.log("TestSuiteRunner::Program Counter (PC) mismatch in " + testCase.name +
                    " | Emulated PC: 0x" + this.theCpu.registers.pc.toString(16) +
                    " | Expected PC: 0x" + testCase.final.pc.toString(16)
                );
                testFailed = true;
            }

            // Validate stack pointer
            if (this.theCpu.registers.sp !== testCase.final.sp) {
                console.log("TestSuiteRunner::Stack Pointer (SP) mismatch in " + testCase.name +
                    " | Emulated SP: 0x" + this.theCpu.registers.sp.toString(16) +
                    " | Expected SP: 0x" + testCase.final.sp.toString(16)
                );
                testFailed = true;
            }

            // Validate index registers
            if (this.theCpu.registers.ixl !== (testCase.final.ix & 0xff)) {
                console.log("TestSuiteRunner::Register IXL mismatch in " + testCase.name);
                testFailed = true;
            }
            if (this.theCpu.registers.ixh !== (testCase.final.ix >> 8)) {
                console.log("TestSuiteRunner::Register IXH mismatch in " + testCase.name);
                testFailed = true;
            }
            if (this.theCpu.registers.iyh !== (testCase.final.iy >> 8)) {
                console.log("TestSuiteRunner::Register IYH mismatch in " + testCase.name);
                testFailed = true;
            }
            if (this.theCpu.registers.iyl !== (testCase.final.iy & 0xff)) {
                console.log("TestSuiteRunner::Register IYL mismatch in " + testCase.name);
                testFailed = true;
            }

            // Validate interrupt configurations
            if (this.theCpu.registers.iff1 !== testCase.final.iff1) {
                console.log("TestSuiteRunner::Interrupt Enable Flag (IFF1) mismatch in " + testCase.name);
                testFailed = true;
            }

            // Validate final memory contents matching test parameters
            for (let v = 0; v < testCase.final.ram.length; v++) {
                const val = this.theMMU.readAddr(testCase.final.ram[v][0]);
                if (val !== testCase.final.ram[v][1]) {
                    console.log("TestSuiteRunner::Memory mismatch at [0x" + testCase.final.ram[v][0].toString(16) +
                        "] | Emulated: 0x" + val.toString(16) +
                        " | Expected: 0x" + testCase.final.ram[v][1].toString(16)
                    );
                    testFailed = true;
                }
            }

            if (testFailed) {
                numTestsFailed++;
            }
            numTestsExecuted++;
        }

        console.log("TestSuiteRunner::Ending test. Total executed: " + numTestsExecuted + " | Failed: " + numTestsFailed);
    }
}

// Global legacy alias to prevent breaking diagnostic runner hooks
const cpuTestRunner = Z80TestSuiteRunner;