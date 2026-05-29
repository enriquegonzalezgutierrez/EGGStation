/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: SegaMasterSystemMapperFactory
 * 
 * Factory responsible for parsing the physical properties of the Cartridge 
 * and instantiating the correct BaseMapper Strategy at boot time.
 */

const SegaMasterSystemMapperHardwareType = {
    SEGA: 0,
    CODEMASTERS: 1,
    KOREAN: 2
};

class SegaMasterSystemMapperFactory {
    /**
     * Inspects cartridge metadata and creates the corresponding BaseMapper subclass instance.
     * @param {SegaMasterSystemCartridge} cartridge - Loaded cartridge instance.
     * @returns {BaseMapper} Configured mapper instance.
     */
    static createMapper(cartridge) {
        let hardwareType = SegaMasterSystemMapperHardwareType.SEGA;

        // Apply Altered Beast original software execution patch
        if (cartridge.romChecksum === 0x38f22e98) {
            console.log("MapperFactory::Applying compatibility soft-patch for [Altered Beast]");
            cartridge.cartridgeRom[0x31b] = 0x00;
            cartridge.cartridgeRom[0x31c] = 0x00;
        }

        // Automatic Codemasters hardware identification based on physical checksum validation header
        if (cartridge.cartridgeRom.length >= 0x8000) {
            const checksum1 = (cartridge.cartridgeRom[0x7fe7] << 8) | cartridge.cartridgeRom[0x7fe6];
            const checksum2 = (cartridge.cartridgeRom[0x7fe9] << 8) | cartridge.cartridgeRom[0x7fe8];
            if ((0x10000 - checksum1) === checksum2) {
                console.log("MapperFactory::ROM identified as [Codemasters] paging hardware.");
                hardwareType = SegaMasterSystemMapperHardwareType.CODEMASTERS;
            }
        }

        // Automatic Korean hardware identification based on unique release database checksum match
        if (
            cartridge.romChecksum === 0x5a7b2220 || // Dodgeball King
            cartridge.romChecksum === 0x224d46cf || // Sangokushi 3
            cartridge.romChecksum === 0x324884ba    // Jang Pung 3
        ) {
            console.log("MapperFactory::ROM identified as [Korean] paging hardware.");
            hardwareType = SegaMasterSystemMapperHardwareType.KOREAN;
        }

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

// Global legacy alias to prevent breakage during structural migration
const SmsMapperFactory = SegaMasterSystemMapperFactory;