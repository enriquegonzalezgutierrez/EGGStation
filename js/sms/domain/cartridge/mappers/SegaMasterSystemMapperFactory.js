/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Sega Master System Mapper Factory
 * 
 * Analyzes cartridge properties (checksums, file structures) at boot time 
 * to instantiate and return the correct BaseMapper strategy (SRP / OCP).
 */

const SegaMasterSystemMapperHardwareType = {
    SEGA: 0,
    CODEMASTERS: 1,
    KOREAN: 2
};

class SegaMasterSystemMapperFactory {
    /**
     * Inspects cartridge metadata and creates the corresponding BaseMapper strategy.
     * @param {SegaMasterSystemCartridge} cartridge - The loaded cartridge.
     * @returns {BaseMapper} The appropriate configured mapper subclass instance.
     */
    static createMapper(cartridge) {
        let hardwareType = SegaMasterSystemMapperHardwareType.SEGA;

        // 1. Soft-patch compatibility rule for Altered Beast export ROM
        if (cartridge.romChecksum === 0x38f22e98) {
            console.log("MapperFactory::Applying original soft-patch to bypass [Altered Beast] crash.");
            cartridge.cartridgeRom[0x31b] = 0x00;
            cartridge.cartridgeRom[0x31c] = 0x00;
        }

        // 2. Automated Codemasters detection rule
        // Codemasters ROMs contain a unique checksum structure at offsets 0x7FE6 - 0x7FE9
        if (cartridge.cartridgeRom.length >= 0x8000) {
            const checksum1 = (cartridge.cartridgeRom[0x7fe7] << 8) | cartridge.cartridgeRom[0x7fe6];
            const checksum2 = (cartridge.cartridgeRom[0x7fe9] << 8) | cartridge.cartridgeRom[0x7fe8];
            
            if (checksum1 !== 0 && (0x10000 - checksum1) === checksum2) {
                console.log("MapperFactory::ROM successfully identified as [Codemasters] hardware.");
                hardwareType = SegaMasterSystemMapperHardwareType.CODEMASTERS;
            }
        }

        // 3. Automated Korean hardware detection rule
        // Compares calculated checksums against known Korean/Zemina software dumps
        if (
            cartridge.romChecksum === 0x5a7b2220 || // Dodgeball King
            cartridge.romChecksum === 0x224d46cf || // Sangokushi 3
            cartridge.romChecksum === 0x324884ba    // Jang Pung 3
        ) {
            console.log("MapperFactory::ROM successfully identified as [Korean] hardware.");
            hardwareType = SegaMasterSystemMapperHardwareType.KOREAN;
        }

        // 4. Instantiation and Strategy injection
        switch (hardwareType) {
            case SegaMasterSystemMapperHardwareType.CODEMASTERS:
                return new CodemastersMapper(cartridge.cartridgeRom);
                
            case SegaMasterSystemMapperHardwareType.KOREAN:
                return new KoreanMapper(cartridge.cartridgeRom);
                
            case SegaMasterSystemMapperHardwareType.SEGA:
            default:
                return new SegaMapper(cartridge.cartridgeRom);
        }
    }
}