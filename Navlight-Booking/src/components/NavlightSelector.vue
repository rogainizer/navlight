<template>
  <div>
    <label>Navlight Set:</label>
    <select v-model="modelValue" required>
      <option value="Set1">Set 1</option>
      <option value="Set2">Set 2</option>
    </select>
  </div>
</template>

<script setup>
import { defineProps, defineEmits } from 'vue'

const props = defineProps({
  modelValue: String
})
const emit = defineEmits(['update:modelValue'])
</script>
