/**
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * File: js/genesis/domain/cartridge/mappers/GenesisMapperFactory.js
 * 
 * Domain Layer: Genesis Mapper Factory
 * 
 * Role:
 * Inspects cartridge metadata to instantiate the correct routing strategy.
 * 
 * SOLID Principles Applied:
 * - Open/Closed Principle (OCP): Logic can be extended for new custom mappers 
 *   without breaking the core CPU or Bus initializers.
 */

class GenesisMapperFactory {
    /**
     * @param {GenesisCartridge} cartridge - The parsed cartridge entity.
     * @returns {GenesisBaseMapper} The appropriate concrete mapper strategy.
     */
    static createMapper(cartridge) {
        if (cartridge.isSegaMapper) {
            return new GenesisSsf2Mapper(cartridge);
        }

        // Default fallback to flat 4MB linear ROM scheme
        return new GenesisStandardMapper(cartridge);
    }
}