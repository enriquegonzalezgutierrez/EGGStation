/* 
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: SmsMapperFactory
 * 
 * Factory responsible for parsing the physical properties of the Cartridge 
 * and instantiating the correct BaseMapper Strategy at boot time.
 */

const SmsMapperHardwareType = {
    SEGA: 0,
    CODEMASTERS: 1,
    KOREAN: 2
};

class SmsMapperFactory {
    static createMapper(cartridge) {
        let hardwareType = SmsMapperHardwareType.SEGA;

        // Apply Altered Beast original software execution patch
        if (cartridge.romChecksum === 0x38f22e98) {
            cartridge.cartridgeRom[0x31b] = 0x00;
            cartridge.cartridgeRom[0x31c] = 0x00;
        }

        // Detect Codemasters Mapper
        if (cartridge.cartridgeRom.length >= 0x8000) {
            const checksum1 = (cartridge.cartridgeRom[0x7fe7] << 8) | cartridge.cartridgeRom[0x7fe6];
            const checksum2 = (cartridge.cartridgeRom[0x7fe9] << 8) | cartridge.cartridgeRom[0x7fe8];
            if ((0x10000 - checksum1) === checksum2) {
                console.log("MapperFactory::ROM identified as Codemasters Hardware");
                hardwareType = SmsMapperHardwareType.CODEMASTERS;
            }
        }

        // Detect Korean Mapper
        if (
            cartridge.romChecksum === 0x5a7b2220 || // Dodgeball King
            cartridge.romChecksum === 0x224d46cf || // Sangokushi 3
            cartridge.romChecksum === 0x324884ba    // Jang Pung 3
        ) {
            console.log("MapperFactory::ROM identified as Korean Hardware Extension");
            hardwareType = SmsMapperHardwareType.KOREAN;
        }

        switch (hardwareType) {
            case SmsMapperHardwareType.CODEMASTERS:
                return new CodemastersMapper(cartridge.cartridgeRom);
            case SmsMapperHardwareType.KOREAN:
                return new KoreanMapper(cartridge.cartridgeRom);
            case SmsMapperHardwareType.SEGA:
            default:
                return new SegaMapper(cartridge.cartridgeRom);
        }
    }
}