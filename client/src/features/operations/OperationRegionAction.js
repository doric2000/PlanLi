import React from 'react';
import { Alert } from 'react-native';
import { useOptionalRegionSelection } from '../region/context/RegionSelectionState';
import { isRegionDiscoveryEnabled, getRegionById } from '../region/regionDefinitions';
import { OperationButton } from './OperationCard';

export default function OperationRegionAction({ entry, onChooseRegion }) {
  const { selectedRegionId, selectRegion } = useOptionalRegionSelection();
  const regions = entry?.discoveryRegionIds || [];
  if (entry?.status !== 'success' || !isRegionDiscoveryEnabled() || !selectedRegionId || !regions.length || regions.includes(selectedRegionId)) return null;
  const choose = async () => {
    if (regions.length !== 1) { onChooseRegion?.(); return; }
    try { await selectRegion(regions[0]); }
    catch { Alert.alert('לא הצלחנו להחליף אזור', 'אפשר לנסות שוב בעוד רגע.'); }
  };
  return <OperationButton testID="operation-switch-region" onPress={choose}>
    {regions.length === 1 ? `מעבר לאזור ${getRegionById(regions[0])?.label || 'הפרסום'}` : 'בחירת אזור הפרסום'}
  </OperationButton>;
}
