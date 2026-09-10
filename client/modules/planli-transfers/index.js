import { requireOptionalNativeModule } from 'expo-modules-core';

// An OTA remains compatible with binaries built before background transfers.
export default requireOptionalNativeModule('PlanLiTransfers');
