import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, useColorScheme } from 'react-native';

interface Props {
  value: number;
  increment: number;
  unit: 'kg' | 'lbs';
  onChange: (value: number) => void;
}

export default function WeightStepper({ value, increment, unit, onChange }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [textValue, setTextValue] = useState('');
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const colors = {
    text: isDark ? '#FFF' : '#000',
    buttonBg: isDark ? '#2C2C2E' : '#E5E5EA',
    accent: '#007AFF',
  };

  const handleDecrement = () => {
    const newVal = Math.max(0, value - increment);
    onChange(newVal);
  };

  const handleIncrement = () => {
    onChange(value + increment);
  };

  const handleStartEdit = () => {
    setTextValue(value % 1 === 0 ? value.toString() : value.toFixed(1));
    setIsEditing(true);
  };

  const handleEndEdit = () => {
    const parsed = parseFloat(textValue);
    if (!isNaN(parsed) && parsed >= 0) {
      onChange(parsed);
    }
    setIsEditing(false);
  };

  const displayValue = value % 1 === 0 ? value.toString() : value.toFixed(1);

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.buttonBg }]}
        onPress={handleDecrement}
      >
        <Text style={[styles.buttonText, { color: colors.accent }]}>-{increment}</Text>
      </TouchableOpacity>

      {isEditing ? (
        <TextInput
          style={[styles.valueInput, { color: colors.text }]}
          value={textValue}
          onChangeText={setTextValue}
          onBlur={handleEndEdit}
          onSubmitEditing={handleEndEdit}
          keyboardType="decimal-pad"
          autoFocus
          selectTextOnFocus
        />
      ) : (
        <TouchableOpacity onPress={handleStartEdit} style={styles.valueContainer}>
          <Text style={[styles.value, { color: colors.text }]}>{displayValue}</Text>
          <Text style={[styles.unit, { color: colors.text }]}>{unit}</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.buttonBg }]}
        onPress={handleIncrement}
      >
        <Text style={[styles.buttonText, { color: colors.accent }]}>+{increment}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  button: {
    width: 72,
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '700',
  },
  valueContainer: {
    alignItems: 'center',
    minWidth: 100,
  },
  value: {
    fontSize: 36,
    fontWeight: '800',
  },
  unit: {
    fontSize: 14,
    marginTop: -2,
  },
  valueInput: {
    fontSize: 36,
    fontWeight: '800',
    textAlign: 'center',
    minWidth: 100,
    borderBottomWidth: 2,
    borderBottomColor: '#007AFF',
    paddingBottom: 4,
  },
});
