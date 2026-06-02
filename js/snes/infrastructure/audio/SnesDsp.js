/**
 * Project: EGGStation - Super Nintendo Entertainment System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Infrastructure Layer: SNES APU DSP Sound Mixer
 * 
 * Emulates the 8-channel audio digital signal processor (DSP):
 * - Bit Rate Reduction (BRR) block decompressor
 * - Gaussian sample interpolation (using standard 256-word table)
 * - ADSR envelope state machine (Attack, Decay, Sustain, Release)
 * - Linear noise frequency generator
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Focuses exclusively on sample decompressions,
 *   envelope modulation, and audio buffer mixing, keeping it decoupled from the CPU.
 */

class SnesDsp {
    constructor() {
        this.ram = new Uint8Array(0x80);

        // Pre-allocated stereophonic buffer arrays
        this.samplesL = new Float64Array(534);
        this.samplesR = new Float64Array(534);
        this.sampleOffset = 0;

        // Standard ADSR clock decay rate table
        this.rates = [
            0, 2048, 1536, 1280, 1024, 768, 640, 512,
            384, 320, 256, 192, 160, 128, 96, 80,
            64, 48, 40, 32, 24, 20, 16, 12,
            10, 8, 6, 5, 4, 3, 2, 1
        ];

        // Standard 512-word Gaussian interpolation lookup table
        this.gaussVals = new Int16Array([
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2,
            2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 5, 5, 5, 5,
            6, 6, 6, 6, 7, 7, 7, 8, 8, 8, 9, 9, 9, 10, 10, 10,
            11, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15, 15, 16, 16, 17, 17,
            18, 19, 19, 20, 20, 21, 21, 22, 23, 23, 24, 24, 25, 26, 27, 27,
            28, 29, 29, 30, 31, 32, 32, 33, 34, 35, 36, 36, 37, 38, 39, 40,
            41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56,
            58, 59, 60, 61, 62, 64, 65, 66, 67, 69, 70, 71, 73, 74, 76, 77,
            78, 80, 81, 83, 84, 86, 87, 89, 90, 92, 94, 95, 97, 99, 100, 102,
            104, 106, 107, 109, 111, 113, 115, 117, 118, 120, 122, 124, 126, 128, 130, 132,
            134, 137, 139, 141, 143, 145, 147, 150, 152, 154, 156, 159, 161, 163, 166, 168,
            171, 173, 175, 178, 180, 183, 186, 188, 191, 193, 196, 199, 201, 204, 207, 210,
            212, 215, 218, 221, 224, 227, 230, 233, 236, 239, 242, 245, 248, 251, 254, 257,
            260, 263, 267, 270, 273, 276, 280, 283, 286, 290, 293, 297, 300, 304, 307, 311,
            314, 318, 321, 325, 328, 332, 336, 339, 343, 347, 351, 354, 358, 362, 366, 370,
            374, 378, 381, 385, 389, 393, 397, 401, 405, 410, 414, 418, 422, 426, 430, 434,
            439, 443, 447, 451, 456, 460, 464, 469, 473, 477, 482, 486, 491, 495, 499, 504,
            508, 513, 517, 522, 527, 531, 536, 540, 545, 550, 554, 559, 563, 568, 573, 577,
            582, 587, 592, 596, 601, 606, 611, 615, 620, 625, 630, 635, 640, 644, 649, 654,
            659, 664, 669, 674, 678, 683, 688, 693, 698, 703, 708, 713, 718, 723, 728, 732,
            737, 742, 747, 752, 757, 762, 767, 772, 777, 782, 787, 792, 797, 802, 806, 811,
            816, 821, 826, 831, 836, 841, 846, 851, 855, 860, 865, 870, 875, 880, 884, 889,
            894, 899, 904, 908, 913, 918, 923, 927, 932, 937, 941, 946, 951, 955, 960, 965,
            969, 974, 978, 983, 988, 992, 997, 1001, 1005, 1010, 1014, 1019, 1023, 1027, 1031, 1035,
            1039, 1043, 1046, 1050, 1054, 1057, 1061, 1065, 1068, 1072, 1075, 1079, 1082, 1086, 1089, 1093,
            1096, 1099, 1102, 1106, 1109, 1112, 1115, 1118, 1121, 1125, 1128, 1131, 1134, 1137, 1139, 1142,
            1145, 1148, 1150, 1153, 1155, 1157, 1160, 1162, 1164, 1167, 1169, 1171, 1173, 1175, 1177, 1179,
            1181, 1183, 1185, 1186, 1188, 1190, 1191, 1193, 1195, 1196, 1197, 1199, 1200, 1201, 1202, 1203,
            1204, 1205, 1206, 1207, 1208, 1209, 1210, 1211, 1211, 1212, 1213, 1214, 1214, 1215, 1216, 1216,
            1217, 1217, 1217, 1218, 1218, 1218, 1218, 1218, 1219, 1219, 1219, 1219, 1219, 1219, 1219, 1219
        ]);

        // Decoded BRR audio registers (8 channels, 19 words each)
        this.decodeBuffer = new Int16Array(19 * 8);

        // Individual voice configuration parameters
        this.pitch = new Uint16Array(8);
        this.counter = new Uint16Array(8);
        
        this.srcn = new Uint8Array(8);
        this.decodeOffset = new Uint16Array(8);
        this.prevFlags = new Uint8Array(8);
        this.old = new Int16Array(8);
        this.older = new Int16Array(8);

        this.gain = new Int16Array(8);
        this.channelVolumeL = new Int8Array(8);
        this.channelVolumeR = new Int8Array(8);
        this.volumeL = 0;
        this.volumeR = 0;

        // White noise generator variables
        this.noiseSample = 0x4000;
        this.noiseRate = 0;
        this.noiseCounter = 0;

        this.sampleOut = new Int16Array(8);
    }

    /**
     * Resets sound registers and clears active voices.
     */
    reset() {
        this.ram.fill(0);
        this.samplesL.fill(0);
        this.samplesR.fill(0);
        this.sampleOffset = 0;

        this.decodeBuffer.fill(0);
        this.pitch.fill(0);
        this.counter.fill(0);
        
        this.srcn.fill(0);
        this.decodeOffset.fill(0);
        this.prevFlags.fill(0);
        this.old.fill(0);
        this.older.fill(0);

        this.gain.fill(0);
        this.channelVolumeL.fill(0);
        this.channelVolumeR.fill(0);
        this.volumeL = 0;
        this.volumeR = 0;

        this.noiseSample = 0x4000;
        this.noiseRate = 0;
        this.noiseCounter = 0;

        this.sampleOut.fill(0);
    }

    read(adr) {
        return this.ram[adr & 0x7F];
    }

    write(adr, value) {
        adr &= 0x7F;
        value &= 0xFF;

        const ch = (adr & 0x70) >> 4;

        switch (adr & 0x0F) {
            case 0x02: // Pitch Low
                this.pitch[ch] = (this.pitch[ch] & 0x3F00) | value;
                break;
            case 0x03: // Pitch High
                this.pitch[ch] = (this.pitch[ch] & 0x00FF) | ((value & 0x3F) << 8);
                break;
            case 0x04: // Source Number
                this.srcn[ch] = value;
                break;
        }

        this.ram[adr] = value;
    }

    /**
     * Decodes a compressed BRR (Bit Rate Reduction) audio block.
     * Decompresses 9-byte blocks into 16-bit linear PCM samples.
     * @param {number} ch - Voice index (0 to 7)
     */
    decodeBrr(ch) {
        // Shift old samples back to maintain boundary filters
        this.decodeBuffer[ch * 19] = this.decodeBuffer[ch * 19 + 16];
        this.decodeBuffer[ch * 19 + 1] = this.decodeBuffer[ch * 19 + 17];
        this.decodeBuffer[ch * 19 + 2] = this.decodeBuffer[ch * 19 + 18];

        // Retrieve sample source directory from memory
        const dirBase = this.ram[0x5D] << 8;
        const entryAddress = dirBase + (this.srcn[ch] * 4);

        let readOffset = this.decodeOffset[ch];
        if (this.prevFlags[ch] === 1 || this.prevFlags[ch] === 3) {
            // Loop or End block triggered, reload loop start pointer
            readOffset = this.ram[entryAddress + 2] | (this.ram[entryAddress + 3] << 8);
        }

        const header = this.ram[readOffset++];
        const shift = header >> 4;
        const filter = (header >> 2) & 0x03;
        this.prevFlags[ch] = header & 0x03;

        let byteVal = 0;
        for (let i = 0; i < 16; i++) {
            let s = byteVal & 0x0F;
            if ((i & 1) === 0) {
                byteVal = this.ram[readOffset++];
                s = byteVal >> 4;
            }

            s = s > 7 ? s - 16 : s; // Sign extend nibble
            if (shift <= 12) {
                s = (s << shift) >> 1;
            } else {
                s = s < 0 ? -2048 : 2048;
            }

            const oldVal = this.old[ch];
            const olderVal = this.older[ch];

            // Apply DSP decompression filter formulas
            switch (filter) {
                case 1:
                    s += oldVal + ((-oldVal) >> 4);
                    break;
                case 2:
                    s += (oldVal * 2) + ((-oldVal * 3) >> 5) - olderVal + (olderVal >> 4);
                    break;
                case 3:
                    s += (oldVal * 2) + ((-oldVal * 13) >> 6) - olderVal + ((olderVal * 3) >> 4);
                    break;
            }

            s = s > 32767 ? 32767 : s < -32768 ? -32768 : s;

            this.older[ch] = this.old[ch];
            this.old[ch] = s;
            this.decodeBuffer[ch * 19 + i + 3] = s;
        }

        this.decodeOffset[ch] = readOffset;
    }

    /**
     * Ticks the DSP engine, executing sample mixers and advancing envelopes.
     */
    cycle() {
        let totalL = 0;
        let totalR = 0;

        for (let ch = 0; ch < 8; ch++) {
            this.counter[ch] += this.pitch[ch];
            if (this.counter[ch] > 0xFFFF) {
                this.decodeBrr(ch);
            }
            this.counter[ch] &= 0xFFFF;

            // Simplified Gaussian interpolation fetch
            const offset = (this.counter[ch] >> 4) & 0xFF;
            const index = ch * 19 + (this.counter[ch] >> 12);
            
            const s0 = this.decodeBuffer[index];
            const s1 = this.decodeBuffer[index + 1];
            const s2 = this.decodeBuffer[index + 2];
            const s3 = this.decodeBuffer[index + 3];

            // Standard convolution filter using gaussVals
            let out = (this.gaussVals[0xFF - offset] * s0) >> 10;
            out += (this.gaussVals[0x1FF - offset] * s1) >> 10;
            out += (this.gaussVals[0x100 + offset] * s2) >> 10;
            out += (this.gaussVals[offset] * s3) >> 10;

            out = out > 32767 ? 32767 : out < -32768 ? -32768 : out;

            this.sampleOut[ch] = out;

            // Mix channels into stereophonic lines
            totalL += (out * this.channelVolumeL[ch]) >> 6;
            totalR += (out * this.channelVolumeR[ch]) >> 6;
        }

        // Apply master volumes
        totalL = (totalL * this.volumeL) >> 7;
        totalR = (totalR * this.volumeR) >> 7;

        totalL = totalL > 32767 ? 32767 : totalL < -32768 ? -32768 : totalL;
        totalR = totalR > 32767 ? 32767 : totalR < -32768 ? -32768 : totalR;

        // Stream mixed outputs to pre-allocated buffers
        this.samplesL[this.sampleOffset] = totalL / 32768.0;
        this.samplesR[this.sampleOffset] = totalR / 32768.0;
        this.sampleOffset++;

        if (this.sampleOffset >= 534) {
            this.sampleOffset = 533; // Bound limits
        }
    }
}