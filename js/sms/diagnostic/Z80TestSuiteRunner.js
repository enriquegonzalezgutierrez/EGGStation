/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Diagnostic Layer: Z80 Test Suite Runner
 * 
 * Automates the verification and regression-test pipelines for instruction logs.
 * Parses standard testing JSON payloads and checks them against registers (SRP).
 */

class Z80TestSuiteRunner {
    /**
     * @param {string} testsPath - Relative URL path pointing to the JSON test database.
     */
    constructor(testsPath) {
        this.curTest = testsPath;
        this.theMMU = new Z80DiagnosticMemory();
        this.theCpu = new ZilogZ80(this.theMMU);
    
        this.testsLoaded = false;
        this.testJsonObject = undefined;

        const self = this;
        const xhr = new XMLHttpRequest();

        xhr.open("GET", testsPath, true);
        xhr.onload = function() {
            self.testJsonObject = JSON.parse(xhr.response);
            self.testsLoaded = true;
            self.runTests();
        };
        xhr.send();
    }

    /**
     * Converts an integer to an 8-bit padded binary string.
     */
    toBinary(n) {
        return n.toString(2).padStart(8, '0');
    }

    /**
     * Iterates over every test definition in the JSON, validating operations.
     */
    runTests() {
        let numTestsExecuted = 0;
        let numTestsFailed = 0;

        console.log(`TestSuiteRunner::Starting suite [${this.curTest}]...`);
        
        for (let testCaseNum = 0; testCaseNum < 1000; testCaseNum++) {
            if (this.testJsonObject[testCaseNum] === undefined) {
                break;
            }

            let testFailed = false;
            this.theMMU.cleanMem();

            const testCase = this.testJsonObject[testCaseNum];

            // 1. Setup initial memory layout
            for (let v = 0; v < testCase.initial.ram.length; v++) {
                this.theMMU.writeAddr(testCase.initial.ram[v][0], testCase.initial.ram[v][1]);
            }

            // 2. Setup mock ports
            if ("ports" in testCase) {
                this.theMMU.preparePort(testCase.ports[0][1]);
            }

            // 3. Inject starting CPU Register states
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

            // 4. Run single instruction
            const emuCycles = this.theCpu.executeOne();

            // Validate instruction timing accuracy
            if (emuCycles !== expectedCycles) {
                console.warn(`TestSuiteRunner::Cycle mismatch! Emulated: ${emuCycles}, Expected: ${expectedCycles}`);
            }

            // 5. Assert final register states
            if (this.theCpu.registers.a !== testCase.final.a) {
                console.log(`TestSuiteRunner::[A] mismatch in ${testCase.name}`); 
                testFailed = true;
            }
            if (this.theCpu.registers.b !== testCase.final.b) {
                console.log(`TestSuiteRunner::[B] mismatch in ${testCase.name}`);
                testFailed = true;
            }
            if (this.theCpu.registers.c !== testCase.final.c) {
                console.log(`TestSuiteRunner::[C] mismatch in ${testCase.name}`);
                testFailed = true;
            }
            if (this.theCpu.registers.d !== testCase.final.d) {
                console.log(`TestSuiteRunner::[D] mismatch in ${testCase.name}`);
                testFailed = true;
            }
            if (this.theCpu.registers.e !== testCase.final.e) {
                console.log(`TestSuiteRunner::[E] mismatch in ${testCase.name}`);
                testFailed = true;
            }

            // Assert core flags (mask out undocumented bits F3 and F5)
            if ((this.theCpu.registers.f & 0xd7) !== (testCase.final.f & 0xd7)) {
                console.log(`TestSuiteRunner::[Flags] mismatch in ${testCase.name} | Emulated: ${this.toBinary(this.theCpu.registers.f)} | Expected: ${this.toBinary(testCase.final.f)}`);
                testFailed = true;
            }

            if (this.theCpu.registers.h !== testCase.final.h) {
                console.log(`TestSuiteRunner::[H] mismatch in ${testCase.name}`);
                testFailed = true;
            }
            if (this.theCpu.registers.l !== testCase.final.l) {
                console.log(`TestSuiteRunner::[L] mismatch in ${testCase.name}`);
                testFailed = true;
            }

            // Assert shadow register parameters
            if (this.theCpu.shadowRegisters.a !== (testCase.final.af_ >> 8)) {
                console.log(`TestSuiteRunner::[A'] mismatch in ${testCase.name}`);
                testFailed = true;
            }
            if (this.theCpu.shadowRegisters.b !== (testCase.final.bc_ >> 8)) {
                console.log(`TestSuiteRunner::[B'] mismatch in ${testCase.name}`);
                testFailed = true;
            }
            if (this.theCpu.shadowRegisters.c !== (testCase.final.bc_ & 0xff)) {
                console.log(`TestSuiteRunner::[C'] mismatch in ${testCase.name}`);
                testFailed = true;
            }
            if (this.theCpu.shadowRegisters.d !== (testCase.final.de_ >> 8)) {
                console.log(`TestSuiteRunner::[D'] mismatch in ${testCase.name}`);
                testFailed = true;
            }
            if (this.theCpu.shadowRegisters.e !== (testCase.final.de_ & 0xff)) {
                console.log(`TestSuiteRunner::[E'] mismatch in ${testCase.name}`);
                testFailed = true;
            }
            if (this.theCpu.shadowRegisters.h !== (testCase.final.hl_ >> 8)) {
                console.log(`TestSuiteRunner::[H'] mismatch in ${testCase.name}`);
                testFailed = true;
            }
            if (this.theCpu.shadowRegisters.l !== (testCase.final.hl_ & 0xff)) {
                console.log(`TestSuiteRunner::[L'] mismatch in ${testCase.name}`);
                testFailed = true;
            }

            // Assert Special execution registers
            if (this.theCpu.registers.pc !== testCase.final.pc) {
                console.log(`TestSuiteRunner::[PC] mismatch in ${testCase.name}`);
                testFailed = true;
            }
            if (this.theCpu.registers.sp !== testCase.final.sp) {
                console.log(`TestSuiteRunner::[SP] mismatch in ${testCase.name}`);
                testFailed = true;
            }
            if (this.theCpu.registers.ixl !== (testCase.final.ix & 0xff)) {
                console.log(`TestSuiteRunner::[IXL] mismatch in ${testCase.name}`);
                testFailed = true;
            }
            if (this.theCpu.registers.ixh !== (testCase.final.ix >> 8)) {
                console.log(`TestSuiteRunner::[IXH] mismatch in ${testCase.name}`);
                testFailed = true;
            }
            if (this.theCpu.registers.iyh !== (testCase.final.iy >> 8)) {
                console.log(`TestSuiteRunner::[IYH] mismatch in ${testCase.name}`);
                testFailed = true;
            }
            if (this.theCpu.registers.iyl !== (testCase.final.iy & 0xff)) {
                console.log(`TestSuiteRunner::[IYL] mismatch in ${testCase.name}`);
                testFailed = true;
            }
            if (this.theCpu.registers.iff1 !== testCase.final.iff1) {
                console.log(`TestSuiteRunner::[IFF1] mismatch in ${testCase.name}`);
                testFailed = true;
            }

            // Assert post-execution memory modifications
            for (let i = 0; i < testCase.final.ram.length; i++) {
                const val = this.theMMU.readAddr(testCase.final.ram[i][0]);
                if (val !== testCase.final.ram[i][1]) {
                    console.log(`TestSuiteRunner::Memory mismatch at [0x${testCase.final.ram[i][0].toString(16)}] | Emu: 0x${val.toString(16)} | Exp: 0x${testCase.final.ram[i][1].toString(16)}`);
                    testFailed = true;
                }
            }

            if (testFailed) {
                numTestsFailed++;
            }
            numTestsExecuted++;
        }

        console.log(`TestSuiteRunner::Suite finished. Total tested: ${numTestsExecuted} | Failed: ${numTestsFailed}`);
    }
}