/* 教练工作台 · 时段与服务（原前端 `CoachWorkbenchView` 的「时段设置」「服务项目」两栏）。

   接后端：
     · `GET  /coach/slots` → { items }；`PUT /coach/slots` { slots:[{date,start_time,end_time}] }
       （PUT 是整批替换，所以「放出去」= 现有 + 新的，一起交上去）
     · `GET  /coach/services`；`POST /coach/services` { name, service_type, duration_min, price_in_cents }
       `PATCH /coach/services/{id}` { isEnabled }
   没有后端：页面里写好的示例，两处动作在页内生效。 */
;(function () {
  'use strict'

  var api = window.FeisiAPI
  if (!api) return
  var live = !!api.live

  var SLOT_STATUS = { AVAILABLE: ['可约', 'chip--green'], BOOKED: ['已被约', 'chip--yellow'], OFF: ['已关闭', ''] }

  var slotForm = document.querySelector('[data-slot-form]')
  var slotRows = document.querySelector('[data-slots]')
  var slotError = document.querySelector('[data-slot-error]')
  var slotStatus = document.querySelector('[data-slot-status]')
  var serviceList = document.querySelector('[data-services]')
  var serviceForm = document.querySelector('[data-service-form]')
  var serviceError = document.querySelector('[data-service-error]')
  var serviceStatus = document.querySelector('[data-service-status]')
  if (!slotForm || !serviceForm) return

  var slots = []
  var services = []
  var busy = false

  function say(node, text) {
    if (node) node.textContent = text || ''
  }

  function fail(node, message) {
    if (!node) return
    node.textContent = message || ''
    node.hidden = !message
  }

  function drawSlots() {
    if (!slotRows) return
    slotRows.innerHTML = slots.length
      ? slots
          .map(function (slot) {
            var pair = SLOT_STATUS[slot.status] || [slot.status, '']
            return (
              '<tr><td class="tnum">' + api.esc(slot.date) + '</td>' +
              '<td class="tnum">' + api.esc(slot.startTime + '–' + slot.endTime) + '</td>' +
              '<td><span class="chip ' + pair[1] + '">' + api.esc(pair[0]) + '</span></td></tr>'
            )
          })
          .join('')
      : '<tr><td colspan="3">' + (api.empty ? api.empty('还没放时段', '放几个你能守得住的时间。') : '还没放时段。') + '</td></tr>'
  }

  function drawServices() {
    if (!serviceList) return
    serviceList.innerHTML = services.length
      ? services
          .map(function (service) {
            return (
              '<li><div class="row">' +
              '<span class="row__art" aria-hidden="true">' + service.durationMin + ' 分</span>' +
              '<span><span class="row__title">' + api.esc(service.name) + '</span>' +
              '<span class="row__meta">' + (service.serviceType === 'PACKAGE' ? '套餐' : '单次') +
              ' · ' + service.durationMin + ' 分钟 · ' + api.money(service.priceInCents) + '</span></span>' +
              '<span class="row__side">' +
              '<span class="chip ' + (service.isEnabled ? 'chip--green' : '') + '">' +
              (service.isEnabled ? '已上架' : '已下架') + '</span> ' +
              '<button class="act" type="button" data-toggle="' + Number(service.id) + '">' +
              (service.isEnabled ? '下架' : '上架') + '</button>' +
              '</span></div></li>'
            )
          })
          .join('')
      : '<li class="panel__note">还没有服务项目。</li>'
  }

  slotForm.addEventListener('submit', function (event) {
    event.preventDefault()
    fail(slotError, '')
    var date = slotForm.elements.date.value
    var start = slotForm.elements.start.value
    var end = slotForm.elements.end.value
    if (!date || !start || !end) {
      fail(slotError, '日期、开始、结束都要填。')
      return
    }
    if (end <= start) {
      fail(slotError, '结束时间要晚于开始时间。')
      return
    }
    if (busy) return
    busy = true
    var next = slots.concat([
      { id: 'new-' + Date.now(), date: date, startTime: start, endTime: end, status: 'AVAILABLE' },
    ])
    var payload = {
      slots: next.map(function (slot) {
        return { date: slot.date, start_time: slot.startTime, end_time: slot.endTime }
      }),
    }
    var request = live ? api.put('/coach/slots', payload) : Promise.resolve()
    request
      .then(function (data) {
        slots = live && data && data.items
          ? data.items.map(function (slot) {
              return { id: slot.id, date: slot.date, startTime: slot.startTime, endTime: slot.endTime, status: slot.status }
            })
          : next
        drawSlots()
        say(slotStatus, '时段已放出去。')
      })
      .catch(function (error) {
        fail(slotError, (error && error.message) || '时段没保存上。')
      })
      .then(function () {
        busy = false
        if (slotStatus && slotStatus.focus) slotStatus.focus()
      })
  })

  serviceForm.addEventListener('submit', function (event) {
    event.preventDefault()
    fail(serviceError, '')
    var name = serviceForm.elements.name.value.trim()
    var duration = Number(serviceForm.elements.duration.value)
    var price = Math.round(Number(serviceForm.elements.price.value) * 100)
    if (name.length < 2) {
      fail(serviceError, '服务名写两个字以上。')
      return
    }
    if (!(duration >= 15 && duration <= 480)) {
      fail(serviceError, '时长在 15–480 分钟之间。')
      return
    }
    if (!(price >= 0)) {
      fail(serviceError, '价格不能是负数。')
      return
    }
    if (busy) return
    busy = true
    var request = live
      ? api.post('/coach/services', {
          name: name,
          service_type: duration >= 100 ? 'PACKAGE' : 'SINGLE',
          duration_min: duration,
          price_in_cents: price,
        })
      : Promise.resolve({ id: Date.now() % 10000, name: name, serviceType: 'SINGLE', durationMin: duration, priceInCents: price, isEnabled: true })
    request
      .then(function (service) {
        services = services.concat([
          {
            id: (service && service.id) || Date.now() % 10000,
            name: name,
            serviceType: (service && service.serviceType) || 'SINGLE',
            durationMin: duration,
            priceInCents: price,
            isEnabled: true,
          },
        ])
        serviceForm.reset()
        drawServices()
        say(serviceStatus, '新服务已上架。')
      })
      .catch(function (error) {
        fail(serviceError, (error && error.message) || '服务没保存上。')
      })
      .then(function () {
        busy = false
        if (serviceStatus && serviceStatus.focus) serviceStatus.focus()
      })
  })

  if (serviceList) {
    serviceList.addEventListener('click', function (event) {
      var button = event.target.closest('[data-toggle]')
      if (!button || busy) return
      var id = Number(button.getAttribute('data-toggle'))
      var current = services.filter(function (service) {
        return Number(service.id) === id
      })[0]
      if (!current) return
      busy = true
      var request = live ? api.patch('/coach/services/' + id, { isEnabled: !current.isEnabled }) : Promise.resolve()
      request
        .then(function () {
          services = services.map(function (service) {
            return Number(service.id) === id ? Object.assign({}, service, { isEnabled: !service.isEnabled }) : service
          })
          drawServices()
          say(serviceStatus, current.isEnabled ? '已下架。' : '已上架。')
        })
        .catch(function (error) {
          say(serviceStatus, (error && error.message) || '这一步没成功。')
        })
        .then(function () {
          busy = false
        })
    })
  }

  if (!live) {
    slots = [
      { id: 1, date: '2026-10-13', startTime: '20:00', endTime: '20:50', status: 'AVAILABLE' },
      { id: 2, date: '2026-10-14', startTime: '10:00', endTime: '10:50', status: 'AVAILABLE' },
      { id: 3, date: '2026-10-15', startTime: '19:00', endTime: '19:50', status: 'BOOKED' },
      { id: 4, date: '2026-10-16', startTime: '21:00', endTime: '21:50', status: 'OFF' },
    ]
    services = [
      { id: 1, name: '单次咨询', serviceType: 'SINGLE', durationMin: 50, priceInCents: 30000, isEnabled: true },
      { id: 2, name: '四周陪伴套餐', serviceType: 'PACKAGE', durationMin: 50, priceInCents: 108000, isEnabled: true },
      { id: 3, name: '首次了解', serviceType: 'SINGLE', durationMin: 15, priceInCents: 0, isEnabled: false },
    ]
    drawSlots()
    drawServices()
    say(slotStatus, '设计演示：时段与服务都是示例，动作会在页内生效。')
  } else {
    api
      .get('/coach/slots')
      .then(function (data) {
        slots = ((data && data.items) || []).map(function (slot) {
          return { id: slot.id, date: slot.date, startTime: slot.startTime, endTime: slot.endTime, status: slot.status }
        })
        drawSlots()
      })
      .catch(function (error) {
        fail(slotError, (error && error.message) || '时段没读出来。')
      })
    api
      .get('/coach/services')
      .then(function (data) {
        services = (data && data.items) || []
        drawServices()
      })
      .catch(function (error) {
        fail(serviceError, (error && error.message) || '服务项目没读出来。')
      })
  }
})()
