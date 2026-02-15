
<template>
  <div>
    <BookingForm @booking-success="refreshBookings" />
    <BookingList ref="bookingListRef" />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import BookingForm from '../components/BookingForm.vue'
import BookingList from '../components/BookingList.vue'

const bookingListRef = ref(null)
function refreshBookings() {
  bookingListRef.value?.loadBookings?.()
}
</script>
