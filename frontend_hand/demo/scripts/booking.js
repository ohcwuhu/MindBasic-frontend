/* 预约：接后端时按 `?coachId=` 取真教练，①服务 ②时段 用真数据重绘，
   ③填想聊什么，右下角「提交订单」真的打 `POST /appointments`。 */
;(function () {
  'use strict'

  var api = window.FeisiAPI
  if (!api || !api.live) return

  var servicesBox = document.querySelector('.services')
  var slotsList = document.querySelector('.slots')
  var need = document.querySelector('#need')
  var needHint = need && need.parentElement.querySelector('.field__hint')
  var aside = document.querySelector('aside.panel')
  var submitButton = aside && aside.querySelector('.btn')
  var sumTotal = document.querySelector('.sum__total')
  if (!servicesBox && !slotsList) return

  var params = new URLSearchParams(window.location.search)
  var coachId = Number(params.get('coachId') || 0)
  var slotId = Number(params.get('slotId') || 0)
  var serviceId = 0
  var pickedService = null
  var pickedSlot = null

  function timeLabel(date) {
    return (
      date.getMonth() + 1 + '-' + date.getDate() + ' ' +
      String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0')
    )
  }

  function setRow(key, value) {
    if (!aside) return
    Array.prototype.forEach.call(aside.querySelectorAll('.kv__row'), function (row) {
      if (row.querySelector('.kv__key').textContent.trim() === key) {
        row.querySelector('.kv__val').textContent = value
      }
    })
  }

  function refreshSummary() {
    var title = document.querySelector('.plate__title')
    if (title) setRow('教练', title.textContent.trim())
    if (pickedService) {
      setRow('服务', pickedService.name + ' · ' + pickedService.durationMin + ' 分钟')
      if (sumTotal) {
        var price = pickedService.priceInCents ? pickedService.priceInCents / 100 : 0
        sumTotal.innerHTML = '<span>合计</span><strong>¥' + price + '</strong>'
      }
    }
    setRow('时间', pickedSlot ? pickedSlot.label : '还没选时段')
  }

  function renderServices(services) {
    if (!servicesBox) return
    if (!services.length) {
      servicesBox.innerHTML = api.empty('这位教练还没上架服务', '换一位教练看看。')
      return
    }
    servicesBox.innerHTML = services
      .map(function (service, index) {
        var price = service.priceInCents ? '¥' + service.priceInCents / 100 : '¥0'
        return (
          '<label class="service pick"><span class="pick__body">' +
          '<span class="service__name">' + api.esc(service.name) + '</span>' +
          '<span class="service__meta">' + (service.serviceType === 'PACKAGE' ? '套餐' : '单次') +
          ' · ' + service.durationMin + ' 分钟</span></span>' +
          '<span class="pick__side"><span class="service__price">' + price + '</span>' +
          '<input type="radio" name="service" value="' + service.id + '"' + (index === 0 ? ' checked' : '') + ' /></span></label>'
        )
      })
      .join('')
    serviceId = services[0].id
    pickedService = services[0]
    servicesBox.addEventListener('change', function (event) {
      var input = event.target.closest('input[name="service"]')
      if (!input) return
      serviceId = Number(input.value)
      pickedService = services.filter(function (item) {
        return item.id === serviceId
      })[0]
      refreshSummary()
    })
    refreshSummary()
  }

  function renderSlots(slots) {
    if (!slotsList) return
    var head = document.querySelector('#s2-title')
    var note = head && head.closest('.panel__head').querySelector('.panel__note')
    if (!slots.length) {
      slotsList.innerHTML = api.empty('暂时没有可约时段', '教练还没放出未来 14 天的空档。')
      if (note) note.textContent = '没有可约时段'
      refreshSummary()
      return
    }
    slotsList.innerHTML = slots
      .map(function (slot) {
        var start = new Date(slot.startAt)
        var label = timeLabel(start)
        var picked = slotId ? slot.id === slotId : false
        if (picked) pickedSlot = { id: slot.id, label: label }
        return (
          '<li><button class="slot' + (picked ? ' is-picked' : '') + '" type="button" data-slot="' + slot.id +
          '" data-label="' + api.esc(label) + '"><time datetime="' + api.esc(slot.startAt) + '">' +
          start.getMonth() + 1 + '-' + start.getDate() + '</time><span>' +
          String(start.getHours()).padStart(2, '0') + ':' + String(start.getMinutes()).padStart(2, '0') +
          '</span></button></li>'
        )
      })
      .join('')
    slotsList.addEventListener('click', function (event) {
      var button = event.target.closest('[data-slot]')
      if (!button) return
      slotId = Number(button.getAttribute('data-slot'))
      pickedSlot = { id: slotId, label: button.getAttribute('data-label') }
      Array.prototype.forEach.call(slotsList.querySelectorAll('.slot'), function (item) {
        item.classList.toggle('is-picked', item === button)
      })
      refreshSummary()
    })
    if (note) note.textContent = '未来 14 天 · ' + slots.length + ' 个空档'
    refreshSummary()
  }

  api
    .get(coachId ? '/coaches/' + coachId : '/coaches?page=1&pageSize=1')
    .then(function (data) {
      var coach = data && data.items ? data.items[0] || null : data
      if (!coach) {
        api.fail(servicesBox || slotsList, new Error('平台上还没有可预约的教练。'))
        return
      }
      coachId = coach.id
      var title = document.querySelector('.plate__title')
      if (title) title.textContent = coach.nickname
      var figure = document.querySelector('.profile__figure img')
      if (figure) figure.src = api.symbol(coach.id)
      renderServices(coach.services || [])
      return api
        .get('/coaches/' + coach.id + '/slots')
        .then(function (slotData) {
          renderSlots((slotData && slotData.items) || [])
        })
        .catch(function () {
          renderSlots([])
        })
    })
    .catch(function (error) {
      api.fail(servicesBox || slotsList, error)
    })

  if (need && needHint) {
    need.addEventListener('input', function () {
      needHint.textContent = '你写的内容只有你和教练能看到。' + need.value.length + ' / 500'
    })
  }

  if (submitButton) {
    submitButton.setAttribute('href', 'javascript:void(0)')
    submitButton.addEventListener('click', function (event) {
      event.preventDefault()
      var needDesc = need ? need.value.trim() : ''
      if (!serviceId) return window.alert('先选一个服务项目')
      if (!slotId) return window.alert('先选一个可约时段')
      if (needDesc.length < 5) return window.alert('用一句话说说你想聊什么（至少 5 个字）')
      api
        .post('/appointments', { coachId: coachId, serviceId: serviceId, slotId: slotId, needDesc: needDesc })
        .then(function (appointment) {
          var foot = aside && aside.querySelector('.panel__foot')
          if (foot) {
            foot.textContent =
              appointment && appointment.orderNo
                ? '已下单 · 订单号 ' + appointment.orderNo + '（30 分钟内支付）'
                : '已下单 · 可在「我的订单」里查看'
          }
          submitButton.textContent = '已提交'
        })
        .catch(function (error) {
          window.alert(error.message || '下单失败，请稍后重试。')
        })
    })
  }
})()
