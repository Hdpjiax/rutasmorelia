import {View} from 'react-native';

const Animated = {View};
export default {
  View: Animated.View,
  createAnimatedComponent: (Component: unknown) => Component,
};
export const useSharedValue = (initial: number) => ({value: initial});
export const useAnimatedStyle = (factory: () => object) => factory();
export const withRepeat = (animation: unknown) => animation;
export const withTiming = (value: unknown) => value;
export const Easing = {out: (fn: unknown) => fn, ease: 'ease'};
export const FadeInRight = {delay: () => ({duration: () => ({})})};