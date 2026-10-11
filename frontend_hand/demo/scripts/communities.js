/* 社群：接后端时用 `/communities`（全部）+ `/communities/mine`（我加入的）重绘，
   帖子流取第一个社群的真帖子。 */
;(function () {
  'use strict'

  var api = window.FeisiAPI
  if (!api || !api.live) return

  var groups = document.querySelector('.groups')
  var posts = document.querySelector('.posts')
  if (!groups && !posts) return

  var COVERS = ['cat-emotion', 'cat-study', 'cat-relation', 'cat-growth', 'cat-crisis', 'cat-story']

  function groupCard(group, index) {
    return (
      '<li class="note group"><div class="group__top">' +
      '<img class="group__art" src="assets/' + COVERS[index % COVERS.length] + '.webp" width="560" height="545" alt="" aria-hidden="true" />' +
      '<div><p class="group__name"><a class="stretch" href="community-detail.html?id=' + group.id + '">' + api.esc(group.name) + '</a></p>' +
      '<p class="group__meta">' + (group.memberCount || 0) + ' 位成员' +
      (group.coachNickname ? ' · 教练 ' + api.esc(group.coachNickname) : '') + '</p></div></div>' +
      '<p class="group__desc">' + api.esc(group.description || '') + '</p>' +
      '<p class="group__foot"><span class="chip' + (group.joined ? ' chip--green' : '') + '">' +
      (group.joined ? '已加入' : '未加入') + '</span>' +
      '<a class="link-quiet" href="community-detail.html?id=' + group.id + '">进去看看</a></p></li>'
    )
  }

  function postCard(post) {
    return (
      '<article class="post"><p class="post__head"><span class="post__who">' +
      api.esc(post.authorNickname || post.nickname || '组员') + '</span> · <time datetime="' +
      api.esc(post.createdAt || '') + '">' + api.esc(api.dateTime(post.createdAt)) + '</time></p>' +
      '<h3 class="post__title">' + api.esc(post.title || '') + '</h3>' +
      '<p class="post__body">' + api.esc(post.content || '') + '</p>' +
      '<p class="post__foot"><span class="post__act">♡ ' + (post.likeCount || 0) + '</span>' +
      '<span class="post__act">评论 ' + (post.commentCount || 0) + '</span>' +
      (post.isPinned ? '<span class="chip chip--yellow">置顶</span>' : '') + '</p></article>'
    )
  }

  Promise.all([
    api.get('/communities?page=1&pageSize=20'),
    api.get('/communities/mine').catch(function () {
      return { items: [] }
    }),
  ])
    .then(function (results) {
      var all = (results[0] && results[0].items) || []
      var mine = (results[1] && results[1].items) || []

      if (groups) {
        var shown = mine.length ? mine : all
        groups.innerHTML = shown.length
          ? shown.map(groupCard).join('')
          : api.empty('还没有加入社群', '平台上暂时也没有开放的社群。')
      }

      if (posts) {
        /* 帖子接口要求是社群成员（非成员会 403），所以只取「我加入的」里的第一个 */
        var target = mine[0] || null
        if (!target) {
          posts.innerHTML = api.empty('还没有加入社群', '加入一个社群后，这里会显示组里的帖子。')
          return
        }
        api
          .get('/communities/' + target.id + '/posts?page=1&pageSize=10')
          .then(function (data) {
            var items = (data && data.items) || []
            posts.innerHTML = items.length
              ? items.map(postCard).join('')
              : api.empty('这个社群还没有帖子', '做第一个开口的人？')
          })
          .catch(function (error) {
            api.fail(posts, error)
          })
      }
    })
    .catch(function (error) {
      api.fail(groups || posts, error)
    })
})()
