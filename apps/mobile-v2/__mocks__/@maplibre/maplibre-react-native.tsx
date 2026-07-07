import React from 'react';
import {View} from 'react-native';

export const Map = ({
  children,
  onDidFinishLoadingMap,
}: {
  children?: React.ReactNode;
  onDidFinishLoadingMap?: () => void;
}) => {
  React.useEffect(() => {
    onDidFinishLoadingMap?.();
  }, [onDidFinishLoadingMap]);
  return <View testID="map-view">{children}</View>;
};
export const Camera = React.forwardRef(function Camera(_props, _ref) {
  return <View testID="map-camera" />;
});
export type CameraRef = {fitBounds: (bounds: unknown, options: unknown) => void};
export const GeoJSONSource = ({
  children,
  data,
}: {
  children?: React.ReactNode;
  data?: {features?: unknown[]};
}) => (
  <View
    testID="geojson-source"
    accessibilityLabel={String(data?.features?.length ?? 0)}>
    {children}
  </View>
);
export const Layer = () => <View testID="map-layer" />;
export const Images = () => null;
export const Marker = ({children}: {children?: React.ReactNode}) => <View testID="map-marker">{children}</View>;
export const UserLocation = () => <View testID="user-location" />;
export const ViewAnnotation = ({children}: {children?: React.ReactNode}) => (
  <View testID="view-annotation">{children}</View>
);