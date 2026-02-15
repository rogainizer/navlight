<template>
  <div>
    <h2>Current Navlight Bookings</h2>
    <ul v-if="bookings.length">
      <li v-for="booking in bookings" :key="booking.id">
        <strong>{{ booking.eventName }}</strong> ({{ booking.navlightSet }})<br>
        Name: {{ booking.name }}<br>
        Email: {{ booking.email }}<br>
        Pickup: {{ booking.pickupDate }} | Event: {{ booking.eventDate }} | Return: {{ booking.returnDate }}
      </li>
    </ul>
    <div v-else>No bookings found.</div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const bookings = ref([])

onMounted(() => {
  // TODO: Replace with API call
  bookings.value = [
    {
      id: 1,
      navlightSet: 'Set1',
      pickupDate: '2026-03-01',
      eventDate: '2026-03-02',
      returnDate: '2026-03-03',
      name: 'Alice',
      email: 'alice@example.com',
      eventName: 'Rogaine Night',
    },
    {
      id: 2,
      navlightSet: 'Set2',
      pickupDate: '2026-03-05',
      eventDate: '2026-03-06',
      returnDate: '2026-03-07',
      name: 'Bob',
      email: 'bob@example.com',
      eventName: 'Navlight Challenge',
    },
  ]
})
</script>

<style scoped>
ul {
  list-style: none;
  padding: 0;
}
li {
  margin-bottom: 20px;
  border-bottom: 1px solid #ccc;
  padding-bottom: 10px;
}
</style>
