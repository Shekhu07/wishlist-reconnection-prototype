import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, type ViewStyle } from "react-native";

/**
 * The predecessor prototype's `fade-up` and `toast-in`, as one component.
 *
 * Both are the same gesture at two amplitudes -- opacity 0→1 while the content
 * rises a few pixels -- and the app had no entrance transition at all, so
 * every surface simply appeared. That is the last obviously-unfinished thing
 * about the chrome next to theirs.
 *
 * This is **not** the loading skeleton §4.5 rules out. That rule bans a
 * placeholder shown *before* a result exists, because it teases a module that
 * may resolve to nothing and shifts the grid when it does. This animates
 * content that has already resolved: nothing here is shown before its data,
 * and nothing here reserves space that might not be filled.
 *
 * `useNativeDriver` is off deliberately -- react-native-web does not implement
 * it, and leaving it on logs a warning on every mount.
 */
export interface FadeInProps {
  children: ReactNode;
  /** `fade-up` for content, `toast` for something that has just happened. */
  variant?: "content" | "toast";
  style?: ViewStyle;
  testID?: string;
}

const VARIANTS = {
  content: { distance: 6, duration: 250 },
  toast: { distance: 10, duration: 200 },
} as const;

export function FadeIn({ children, variant = "content", style, testID }: FadeInProps) {
  const { distance, duration } = VARIANTS[variant];
  // One value drives both properties: they are a single gesture, and running
  // two timings risks them finishing a frame apart.
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, duration]);

  return (
    <Animated.View
      testID={testID}
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [distance, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
