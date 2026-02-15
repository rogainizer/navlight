<template>
  <div class="calendar">
    <h2>Navlight Bookings Calendar (Next 12 Months)</h2>
    <div class="months">
      <div v-for="month in months" :key="month.key" class="month">
        <h3>{{ month.label }}</h3>
        <ul>
          <li v-for="booking in month.bookings" :key="booking.id">
            <strong>{{ booking.eventName }}</strong> ({{ booking.navlightSet }})<br>
            {{ booking.pickupDate }} → {{ booking.returnDate }}<br>
            Name: {{ booking.name }}
          </li>
        </ul>
        <div v-if="month.bookings.length === 0" class="empty">No bookings</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { format, addMonths, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns'

const props = defineProps({ bookings: Array })

const now = new Date()
const months = computed(() => {
  return Array.from({ length: 12 }).map((_, i) => {
    const start = startOfMonth(addMonths(now, i))
    const end = endOfMonth(addMonths(now, i))
    const label = format(start, 'MMMM yyyy')
    const key = format(start, 'yyyy-MM')
    const bookingsInMonth = (props.bookings || []).filter(b => {
      const pickup = parseISO(b.pickupDate)
      const returnDate = parseISO(b.returnDate)
      return (
        isWithinInterval(pickup, { start, end }) ||
        isWithinInterval(returnDate, { start, end }) ||
        (pickup < start && returnDate > end)
      )
    })
    return { label, key, bookings: bookingsInMonth }
  })
})
</script>

<style scoped>
.calendar {
  margin-top: 20px;
}
.months {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
}
.month {
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 12px;
  width: 220px;
  min-height: 120px;
  background: #f9f9f9;
}
ul {
  list-style: none;
  padding: 0;
}
.empty {
  color: #888;
  font-style: italic;
}
</style>
