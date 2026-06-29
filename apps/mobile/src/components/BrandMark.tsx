import Svg, {Circle, Defs, LinearGradient, Path, Stop} from 'react-native-svg';

type Props = {size?: number};

export function BrandMark({size = 32}: Props) {
  return (
    <Svg accessibilityLabel="ViaMorelia" width={size} height={size} viewBox="0 0 100 100" fill="none">
      <Defs>
        <LinearGradient id="brandBlue" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#3B82F6" />
          <Stop offset="1" stopColor="#1D4ED8" />
        </LinearGradient>
        <LinearGradient id="brandGreen" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#10B981" />
          <Stop offset="1" stopColor="#047857" />
        </LinearGradient>
      </Defs>
      <Path d="M15 80V40C15 22 42 22 42 40V80" stroke="url(#brandBlue)" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M42 80V40C42 22 69 22 69 40V80" stroke="url(#brandGreen)" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={42} cy={55} r={7} fill="#FFFFFF" stroke="#111827" strokeWidth={4} />
    </Svg>
  );
}
