// The campfire game's words: the Vietnamese/English string map, points and clock formatting, a
// typed signed amount parsed, and award names normalized for duplicate checks. Pure; no DOM.
//
//   STRINGS          key → { vi, en }, written out in full (Vietnamese is never title-cased by
//                    code); English labels in Title Case, hints in sentences (CONTRIBUTING.md).
//                    Keys are namespaced: app. round. phase. status. role. mode. scenery.
//                    emblem. action. tab. label. unit. word. key. (labels, Title Case in both
//                    languages) and hint. check. error. (sentences, 160 characters or fewer).
//                    `{name}` placeholders are filled with fill().
//   t(key, lang)     the string, or the key itself when it's missing (never throws); `lang` may
//                    also be a display mode: 'bilingual' → 'vi · en', 'en-first' → 'en · vi',
//                    'vi-only' → vi
//   bilingual        the same joining for any two texts (a custom name and its translation)
//   fill             '{n} teams need a status.' + { n: 2 } → '2 teams need a status.'
//   formatPoints     always signed: '+75 Team Points', '−25 Individual Points' (U+2212 minus),
//                    '+25 Each', zero as 'Recognition · 0 Points'; thousands grouped per language
//   formatNumber     a total for the standings: '1,040', '−25' (no forced plus)
//   formatClock(ms)  'm:ss', rounded up to the whole second, never negative, minutes unbounded
//   parsePoints      '+50', '-25', '−25', '0' → a safe integer, or null
//   cleanText        what is stored for a name: NFC, trimmed, inner whitespace collapsed
//   normalizeName    what duplicate checks compare: NFD, combining marks stripped, đ/Đ → d,
//                    trimmed, whitespace collapsed, lowercased
import { ROUND_CATEGORIES } from './types.js';

/** @typedef {import('./types.js').Lang} Lang */
/** @typedef {import('./types.js').DisplayMode} DisplayMode */

/** The languages strings come in. */
export const LANGS = /** @type {const} */ (['vi', 'en']);

/** The U+2212 minus sign every negative number is shown with. */
export const MINUS = '−';

/** What joins the two languages in a bilingual line. */
const JOIN = ' · ';

/** @param {string} vi @param {string} en */
const pair = (vi, en) => Object.freeze({ vi, en });

/** The Vietnamese of each round's default prompt (ROUND_CATEGORIES.prompt is the English). */
const DEFAULT_PROMPTS_VI = /** @type {Record<string, string>} */ ({
  faith: 'Hãy kể một điều về thánh quan thầy của đội và một cách chúng ta có thể noi gương ngài trong tuần này.',
  dance: 'Sáng tạo bốn động tác có thể lặp lại, kể một câu chuyện về tinh thần cùng nhau làm việc.',
  prayer: 'Chuẩn bị một lời cầu nguyện tạ ơn hoặc một câu Kinh Thánh về lòng tin cậy Chúa.',
  skit: 'Diễn lại một khoảnh khắc trong dụ ngôn Người Samari nhân hậu và kết bằng một câu về việc làm người thân cận.',
  cheer: 'Có tên đội, một giá trị đội muốn sống, và một câu đáp mà mọi người cùng hô theo.',
});

/**
 * The string map: key → its Vietnamese and English text.
 * @type {Record<string, { vi: string, en: string }>}
 */
export const STRINGS = Object.freeze({
  // The game
  'app.title': pair('Lửa Trại Nghĩa Sĩ', 'Nghĩa Sĩ Campfire'),
  'app.host': pair('Bảng Điều Khiển Quản Trò', 'Host Console'),

  // The five rounds (from the contract's table, so the words never drift)
  ...Object.fromEntries(ROUND_CATEGORIES.map((c) => [`round.${c.key}`, pair(c.vi, c.en)])),
  // The rounds' default prompts (types.js holds the English): the Vietnamese the display shows for them.
  ...Object.fromEntries(
    ROUND_CATEGORIES.map((c) => [`hint.defaultPrompt.${c.key}`, pair(DEFAULT_PROMPTS_VI[c.key] ?? c.prompt, c.prompt)]),
  ),

  // Event and round phases
  'phase.setup': pair('Thiết Lập', 'Setup'),
  'phase.running': pair('Đang Diễn Ra', 'Running'),
  'phase.finished': pair('Đã Kết Thúc', 'Finished'),
  'phase.welcome': pair('Chào Mừng', 'Welcome'),
  'phase.briefing': pair('Giới Thiệu Vòng', 'Briefing'),
  'phase.preparation': pair('Chuẩn Bị', 'Preparation'),
  'phase.performances': pair('Trình Diễn', 'Performances'),
  'phase.performing': pair('Đang Trình Diễn', 'Performing'),
  'phase.review': pair('Duyệt Điểm', 'Review'),
  'phase.reveal': pair('Công Bố', 'Reveal'),
  'phase.results': pair('Kết Quả', 'Results'),

  // Completion and record statuses
  'status.complete': pair('Hoàn Thành', 'Complete'),
  'status.passed': pair('Bỏ Lượt', 'Passed'),
  'status.absent': pair('Vắng Mặt', 'Absent'),
  'status.unset': pair('Chưa Chọn', 'No Status'),
  'status.skipped': pair('Đã Bỏ Qua', 'Skipped'),
  'status.draft': pair('Bản Nháp', 'Draft'),
  'status.published': pair('Đã Công Bố', 'Published'),
  'status.discarded': pair('Đã Hủy', 'Discarded'),
  'status.performed': pair('Đã Trình Diễn', 'Performed'),
  'status.upNext': pair('Sắp Tới', 'Up Next'),

  // Roles
  'role.host': pair('Quản Trò', 'Host'),
  'role.coGm': pair('Giám Khảo', 'Co-GM'),
  'role.captain': pair('Đội Trưởng', 'Captain'),
  'role.display': pair('Màn Chiếu', 'Display'),
  'role.member': pair('Đoàn Sinh', 'Member'),

  // Display language modes
  'mode.bilingual': pair('Song Ngữ', 'Bilingual'),
  'mode.en-first': pair('Tiếng Anh Trước', 'English First'),
  'mode.vi-only': pair('Chỉ Tiếng Việt', 'Vietnamese Only'),
  'mode.vi': pair('Tiếng Việt', 'Vietnamese'),
  'mode.en': pair('Tiếng Anh', 'English'),

  // Sceneries (src/sceneries.js names them in English)
  'scenery.ruins': pair('Phế Tích Gothic', 'Gothic Ruins'),
  'scenery.shrine': pair('Đền Thánh', 'The Shrine'),
  'scenery.cathedral': pair('Bàn Thờ Nhà Thờ Chính Tòa', 'Cathedral Altar'),

  // Team emblems
  'emblem.shield': pair('Khiên', 'Shield'),
  'emblem.star': pair('Ngôi Sao', 'Star'),
  'emblem.flame': pair('Ngọn Lửa', 'Flame'),
  'emblem.cross': pair('Thánh Giá', 'Cross'),
  'emblem.dove': pair('Chim Bồ Câu', 'Dove'),
  'emblem.crown': pair('Vương Miện', 'Crown'),
  'emblem.anchor': pair('Mỏ Neo', 'Anchor'),
  'emblem.lamp': pair('Đèn Dầu', 'Lamp'),

  // Buttons: the round flow
  'action.startEvent': pair('Bắt Đầu Sự Kiện', 'Start Event'),
  'action.startRound': pair('Bắt Đầu Vòng', 'Start Round'),
  'action.startNextRound': pair('Bắt Đầu Vòng Tiếp Theo', 'Start Next Round'),
  'action.startPreparation': pair('Bắt Đầu Chuẩn Bị', 'Start Preparation'),
  'action.endPreparation': pair('Kết Thúc Chuẩn Bị', 'End Preparation'),
  'action.nextTeam': pair('Đội Tiếp Theo', 'Next Team'),
  'action.nextTeamNamed': pair('Đội Tiếp Theo: {team}', 'Next Team: {team}'),
  'action.reviewRound': pair('Duyệt Điểm Vòng', 'Review Round'),
  'action.reopenJudging': pair('Mở Lại Chấm Điểm', 'Reopen Judging'),
  'action.publishReveal': pair('Công Bố Và Trình Chiếu', 'Publish And Reveal'),
  'action.publishRevealRound': pair('Công Bố Và Trình Chiếu Vòng {n}', 'Publish And Reveal Round {n}'),
  'action.skipRound': pair('Bỏ Qua Vòng', 'Skip Round'),
  'action.endEvent': pair('Kết Thúc Sự Kiện', 'End Event'),
  'action.resumeEvent': pair('Tiếp Tục Sự Kiện', 'Resume Event'),
  'action.newEvent': pair('Sự Kiện Mới', 'New Event'),

  // Buttons: timers
  'action.start': pair('Bắt Đầu', 'Start'),
  'action.pause': pair('Tạm Dừng', 'Pause'),
  'action.resume': pair('Tiếp Tục', 'Resume'),
  'action.add30': pair('Thêm 30 Giây', 'Add 30 Seconds'),

  // Buttons: the reveal
  'action.pauseReveal': pair('Tạm Dừng Công Bố', 'Pause Reveal'),
  'action.resumeReveal': pair('Tiếp Tục Công Bố', 'Resume Reveal'),
  'action.nextBanner': pair('Băng Rôn Tiếp Theo', 'Next Banner'),
  'action.skipToResults': pair('Chuyển Đến Kết Quả', 'Skip To Results'),

  // Buttons: judging
  'action.judgeMode': pair('Chế Độ Giám Khảo', 'Judge Mode'),
  'action.done': pair('Xong', 'Done'),
  'action.add': pair('Thêm', 'Add'),
  'action.addPoints': pair('Thêm {points}', 'Add {points}'),
  'action.addEach': pair('Thêm {points} · {n} Người', 'Add {points} · {n} People'),
  'action.edit': pair('Sửa', 'Edit'),
  'action.remove': pair('Xóa', 'Remove'),
  'action.undo': pair('Hoàn Tác', 'Undo'),
  'action.keepAnyway': pair('Vẫn Giữ Lại', 'Keep Anyway'),
  'action.saveTemplate': pair('Lưu Làm Mẫu', 'Save As Template'),
  'action.useTemplate': pair('Dùng Mẫu', 'Use Template'),
  'action.addCorrection': pair('Thêm Đính Chính', 'Add Correction'),
  'action.team': pair('Cho Đội', 'Team'),
  'action.individual': pair('Cho Cá Nhân', 'Individual'),

  // Buttons: setup, roster and data
  'action.addTeam': pair('Thêm Đội', 'Add Team'),
  'action.addMembers': pair('Thêm Đoàn Sinh', 'Add Members'),
  'action.addGm': pair('Thêm Giám Khảo', 'Add Co-GM'),
  'action.save': pair('Lưu', 'Save'),
  'action.cancel': pair('Hủy', 'Cancel'),
  'action.confirm': pair('Xác Nhận', 'Confirm'),
  'action.close': pair('Đóng', 'Close'),
  'action.exportBackup': pair('Xuất Bản Sao Lưu', 'Export Backup'),
  'action.import': pair('Nhập Dữ Liệu', 'Import'),
  'action.importBackup': pair('Nhập Bản Sao Lưu', 'Import Backup'),
  'action.exportResults': pair('Xuất Kết Quả', 'Export Results'),
  'action.deleteEventData': pair('Xóa Dữ Liệu Sự Kiện', 'Delete Event Data'),
  'action.printCards': pair('In Thẻ Chấm Điểm', 'Print Award Cards'),
  'action.readyOffline': pair('Sẵn Sàng Ngoại Tuyến', 'Ready For Offline'),

  // Buttons: the display window
  'action.openDisplay': pair('Mở Cửa Sổ Màn Chiếu', 'Open Display Window'),
  'action.previewDisplay': pair('Xem Trước Màn Chiếu', 'Preview Display'),
  'action.fullScreen': pair('Toàn Màn Hình', 'Full Screen'),
  'action.testPattern': pair('Hiện Mẫu Kiểm Tra', 'Show Test Pattern'),
  'action.takeOver': pair('Tiếp Quản', 'Take Over'),

  // Host console tabs
  'tab.run': pair('Điều Khiển', 'Run'),
  'tab.roster': pair('Đội & Danh Sách', 'Teams & Roster'),
  'tab.review': pair('Duyệt Điểm', 'Review'),
  'tab.history': pair('Lịch Sử', 'History'),
  'tab.setup': pair('Thiết Lập', 'Setup'),

  // Field labels and headings
  'label.round': pair('Vòng', 'Round'),
  'label.roundN': pair('Vòng {n}', 'Round {n}'),
  'label.rounds': pair('Các Vòng', 'Rounds'),
  'label.team': pair('Đội', 'Team'),
  'label.teams': pair('Các Đội', 'Teams'),
  'label.roster': pair('Danh Sách', 'Roster'),
  'label.coGms': pair('Các Giám Khảo', 'Co-GMs'),
  'label.display': pair('Màn Chiếu', 'Display'),
  'label.recipientType': pair('Loại Người Nhận', 'Recipient Type'),
  'label.recipients': pair('Người Nhận', 'Recipients'),
  'label.to': pair('Cho', 'To'),
  'label.individual': pair('Cá Nhân', 'Individual'),
  'label.name': pair('Tên', 'Name'),
  'label.translation': pair('Bản Dịch', 'Translation'),
  'label.points': pair('Điểm', 'Points'),
  'label.privateNote': pair('Ghi Chú Riêng', 'Private Note'),
  'label.noteForHts': pair('Ghi Chú Cho Huynh Trưởng', 'Note For HTs'),
  'label.from': pair('Từ', 'From'),
  'label.me': pair('Tôi', 'Me'),
  'label.reason': pair('Lý Do', 'Reason'),
  'label.duplicateReason': pair('Lý Do Giữ Lại', 'Reason To Keep'),
  'label.color': pair('Màu', 'Color'),
  'label.emblem': pair('Biểu Tượng', 'Emblem'),
  'label.patron': pair('Thánh Bổn Mạng', 'Patron Saint'),
  'label.prompt': pair('Đề Bài', 'Prompt'),
  'label.basePoints': pair('Điểm Hoàn Thành', 'Completion Points'),
  'label.completion': pair('Hoàn Thành', 'Completion'),
  'label.prepTime': pair('Thời Gian Chuẩn Bị', 'Preparation Time'),
  'label.turnTime': pair('Thời Gian Mỗi Lượt', 'Turn Time'),
  'label.transitionTime': pair('Thời Gian Chuyển Đội', 'Transition Time'),
  'label.reviewReveal': pair('Duyệt Và Công Bố', 'Review And Reveal'),
  'label.opening': pair('Khai Mạc', 'Opening'),
  'label.finale': pair('Tổng Kết', 'Finale'),
  'label.buffer': pair('Thời Gian Dự Phòng', 'Buffer'),
  'label.estimate': pair('Thời Lượng Dự Kiến', 'Estimate'),
  'label.target': pair('Mục Tiêu', 'Target'),
  'label.language': pair('Ngôn Ngữ', 'Language'),
  'label.hostLanguage': pair('Ngôn Ngữ Quản Trò', 'Host Language'),
  'label.scenery': pair('Khung Cảnh', 'Scenery'),
  'label.reducedMotion': pair('Giảm Chuyển Động', 'Reduced Motion'),
  'label.sound': pair('Âm Thanh', 'Sound'),
  'label.showMembers': pair('Hiện Đoàn Sinh', 'Show Members'),
  'label.hostPin': pair('Mã PIN Quản Trò', 'Host PIN'),
  'label.queue': pair('Thứ Tự Trình Diễn', 'Queue'),
  'label.addAward': pair('Ghi Điểm', 'Add Award'),
  'label.projected': pair('Dự Kiến', 'Projected'),
  'label.notPublished': pair('Chưa Công Bố', 'Not Published'),
  'label.thisRound': pair('Vòng Này', 'This Round'),
  'label.myAwards': pair('Điểm Tôi Cho Vòng Này', 'My Awards This Round'),
  'label.othersAwards': pair('Điểm Khác Trong Vòng Này', 'Also This Round'),
  'label.recent': pair('Gần Đây', 'Recent'),
  'label.templates': pair('Mẫu', 'Templates'),
  'label.awardCards': pair('Thẻ Chấm Điểm', 'Award Cards'),
  'label.correction': pair('Đính Chính', 'Correction'),
  'label.corrections': pair('Các Đính Chính', 'Corrections'),
  'label.original': pair('Mục Gốc', 'Original Entry'),
  'label.eventClock': pair('Đồng Hồ Sự Kiện', 'Event Clock'),
  'label.timer': pair('Đồng Hồ', 'Timer'),
  'label.turn': pair('Lượt', 'Turn'),
  'label.next': pair('Tiếp Theo', 'Next'),
  'label.place': pair('Hạng', 'Place'),
  'label.total': pair('Tổng', 'Total'),
  'label.roundScore': pair('Điểm Vòng', 'Round Score'),
  'label.teamStandings': pair('Xếp Hạng Đội', 'Team Standings'),
  'label.leadingIndividuals': pair('Cá Nhân Nổi Bật', 'Leading Individuals'),
  'label.individualRanking': pair('Xếp Hạng Cá Nhân', 'Individual Ranking'),
  'label.finalStandings': pair('Bảng Xếp Hạng Chung Cuộc', 'Final Standings'),
  'label.pageOf': pair('Trang {page}/{pages}', 'Page {page} Of {pages}'),
  'label.saved': pair('Đã Lưu', 'Saved'),
  'label.notSaved': pair('Chưa Lưu Được', 'Not Saved'),
  'label.newTeam': pair('Đội Mới', 'New Team'),
  'label.hostClosed': pair('Cửa Sổ Quản Trò Đã Đóng', 'Host Window Closed'),
  'label.displayOpen': pair('Màn Chiếu Đang Mở', 'Display Open'),
  'label.displayClosed': pair('Màn Chiếu Đã Đóng', 'Display Closed'),
  'label.displayNotOpened': pair('Chưa Mở Màn Chiếu', 'Display Not Opened'),
  'label.duplicates': pair('Trùng Lặp', 'Duplicates'),
  'label.largeValues': pair('Giá Trị Lớn', 'Large Values'),
  'label.noIndividual': pair('Chưa Có Điểm Cá Nhân', 'No Individual Awards Yet'),
  'label.revealLength': pair('Thời Lượng Công Bố', 'Reveal Length'),
  'label.judgeModeFor': pair('Chế Độ Giám Khảo · {name}', 'Judge Mode · {name}'),
  'label.projectorChecklist': pair('Kiểm Tra Máy Chiếu', 'Projector Checklist'),
  'label.keyboard': pair('Phím Tắt', 'Keyboard Shortcuts'),

  // Units
  'unit.points': pair('Điểm', 'Points'),
  'unit.teamPoints': pair('Điểm Đội', 'Team Points'),
  'unit.individualPoints': pair('Điểm Cá Nhân', 'Individual Points'),
  'unit.recognition': pair('Ghi Nhận', 'Recognition'),
  'unit.each': pair('Mỗi Bên', 'Each'),
  'unit.eachTeam': pair('Mỗi Đội', 'Each'),
  'unit.eachPerson': pair('Mỗi Người', 'Each'),

  // The design's wording table (product translations, not official titles)
  'word.tntt': pair('Thiếu Nhi Thánh Thể', 'Eucharistic Youth Movement'),
  'word.nghiaSi': pair('Nghĩa Sĩ', 'Companion'),
  'word.huynhTruong': pair('Huynh Trưởng', 'Youth Leader'),
  'word.doanSinh': pair('Đoàn Sinh', 'Youth Member'),
  'word.quanTro': pair('Quản Trò', 'Game Leader'),
  'word.judgingTeam': pair('Ban Giám Khảo', 'Judging Team'),
  'word.judgeMode': pair('Chế Độ Giám Khảo', 'Judge Mode'),
  'word.team': pair('Đội', 'Team'),
  'word.teamCaptain': pair('Đội Trưởng', 'Team Captain'),
  'word.roster': pair('Danh Sách', 'Roster'),
  'word.round': pair('Vòng', 'Round'),
  'word.preparation': pair('Chuẩn Bị', 'Preparation'),
  'word.time': pair('Hết Giờ', 'Time'),
  'word.points': pair('Điểm', 'Points'),
  'word.bonusPoints': pair('Điểm Thưởng', 'Bonus Points'),
  'word.deduction': pair('Điểm Trừ', 'Point Deduction'),
  'word.adjustment': pair('Điều Chỉnh Điểm', 'Point Adjustment'),
  'word.nameValue': pair('Tên / Giá Trị', 'Name / Value'),
  'word.reviewScores': pair('Duyệt Điểm', 'Review Scores'),
  'word.revealScores': pair('Công Bố Điểm', 'Reveal Scores'),
  'word.standings': pair('Bảng Xếp Hạng', 'Standings'),
  'word.creativity': pair('Sáng Tạo', 'Creativity'),
  'word.teamSpirit': pair('Tinh Thần Đồng Đội', 'Team Spirit'),
  'word.overTime': pair('Quá Giờ', 'Over Time'),

  // The host console's shell (Stage 2): the next action, the top bar, the lock, the shortcuts
  'action.startRoundN': pair('Bắt Đầu Vòng {n}', 'Start Round {n}'),
  'action.startPerformances': pair('Bắt Đầu Trình Diễn', 'Start Performances'),
  'action.showResults': pair('Xem Kết Quả', 'Show Results'),
  'action.hidePreview': pair('Ẩn Xem Trước', 'Hide Preview'),
  'label.event': pair('Sự Kiện', 'Event'),
  'label.estOver': pair('Dự Kiến +{over}', 'Est. +{over}'),
  'label.webglOff': pair('Màn Chiếu Không Có WebGL', 'Display Without WebGL'),
  'label.otherHost': pair('Quản Trò Đang Mở Ở Thẻ Khác', 'Host Open In Another Tab'),
  'key.toggleTimer': pair('Tạm Dừng Hoặc Tiếp Tục Đồng Hồ', 'Pause Or Resume the Timer'),
  'key.showKeys': pair('Hiện Phím Tắt', 'Show Keyboard Shortcuts'),
  'key.groupJudging': pair('Chấm Điểm', 'Judging'),

  // The Run tab (hostRun.js): the queue, the turn timer, Add Award, this round's entries, Projected
  'label.statusFor': pair('Trạng Thái · {team}', 'Status · {team}'),
  'label.turnOf': pair('Lượt · {team}', 'Turn · {team}'),
  'label.editAward': pair('Sửa Điểm', 'Edit Award'),
  'label.findRecipient': pair('Tìm Người Nhận', 'Find Recipient'),
  'label.awards': pair('Điều Chỉnh', 'Awards'),
  'label.projectedLegend': pair('Hoàn Thành + Điều Chỉnh = Điểm Vòng', 'Completion + Awards = Round Score'),
  'label.bannerOf': pair('Băng Rôn {step}/{total}', 'Banner {step} Of {total}'),
  'label.keptDuplicate': pair('Giữ Lại Dù Trùng', 'Kept Duplicate'),
  'label.largeValue': pair('Giá Trị Lớn', 'Large Value'),
  'action.replayReveal': pair('Trình Chiếu Lại', 'Replay Reveal'),
  'action.removeTemplate': pair('Xóa Mẫu {name}', 'Remove Template {name}'),
  'hint.pickTeam': pair('Chọn đội này làm người nhận điểm.', 'Make this team the award recipient.'),
  'hint.runIdle': pair(
    'Khi một vòng bắt đầu, thứ tự trình diễn, đồng hồ và điểm sẽ hiện ở đây.',
    'Once a round starts, its queue, timer and awards appear here.',
  ),
  'hint.awardsClosed': pair(
    'Có thể ghi điểm khi vòng bắt đầu chuẩn bị.',
    "Awards open when the round's preparation starts.",
  ),
  'hint.roundPublished': pair(
    'Vòng này đã công bố; hãy thêm đính chính ở tab Lịch Sử nếu cần sửa.',
    'This round is published; add a correction in History to change it.',
  ),
  'hint.roundSkipped': pair('Vòng này đã được bỏ qua và tính 0 điểm.', 'This round was skipped and counts zero.'),
  'hint.noTimer': pair('Giai đoạn này không có đồng hồ.', 'No timer runs in this phase.'),
  'hint.noEntries': pair('Chưa có điểm nào trong vòng này.', 'No awards this round yet.'),
  'hint.noMatches': pair('Không có kết quả phù hợp.', 'Nothing matches that search.'),
  'hint.noRoster': pair('Danh sách chưa có đoàn sinh.', 'The roster has no members yet.'),
  'hint.removed': pair('Đã xóa “{name}”.', 'Removed “{name}”.'),

  // The Setup and Teams & Roster tabs (hostSetup.js): teams, roster, co-GMs, rounds, display, data, offline
  'label.eventDetails': pair('Thông Tin Sự Kiện', 'Event Details'),
  'label.eventTitle': pair('Tên Sự Kiện', 'Event Title'),
  'label.schedule': pair('Lịch Trình', 'Schedule'),
  'label.search': pair('Tìm Kiếm', 'Search'),
  'label.teamsN': pair('{n} Đội', '{n} Teams'),
  'label.membersN': pair('{n} Đoàn Sinh', '{n} Members'),
  'label.lateTeam': pair('Thêm Đội Giữa Chừng', 'Add a Team During Play'),
  'label.namesOnePerLine': pair('Tên, Mỗi Dòng Một Người', 'Names, One Per Line'),
  'label.moveTo': pair('Chuyển Sang Đội', 'Move To Team'),
  'label.data': pair('Dữ Liệu', 'Data'),
  'label.cardsAndData': pair('Thẻ Chấm Điểm Và Dữ Liệu', 'Award Cards And Data'),
  'label.offlinePage': pair('Tệp Của Trang', 'Page Files'),
  'label.offlineDisplay': pair('Đã Mở Cửa Sổ Màn Chiếu', 'Display Window Opened'),
  'label.offlineBonfire': pair('Mô Hình Lửa Trại', 'Bonfire Model'),
  'label.offlineKnight': pair('Mô Hình Hiệp Sĩ', 'Knight Model'),
  'label.fontInter': pair('Phông Chữ Inter', 'Inter Font'),
  'label.fontCinzel': pair('Phông Chữ Cinzel', 'Cinzel Font'),
  'label.fontPixelify': pair('Phông Chữ Pixelify Sans', 'Pixelify Sans Font'),
  'status.ready': pair('Sẵn Sàng', 'Ready'),
  'status.missing': pair('Còn Thiếu', 'Missing'),
  'status.notChecked': pair('Chưa Kiểm Tra', 'Not Checked'),
  'action.removeTeam': pair('Xóa Đội', 'Remove Team'),
  'action.addLateTeam': pair('Thêm Đội Đến Muộn', 'Add Late Team'),
  'action.showDetails': pair('Hiện Chi Tiết', 'Show Details'),
  'action.hideDetails': pair('Ẩn Chi Tiết', 'Hide Details'),
  'action.chooseBackup': pair('Chọn Tệp Sao Lưu', 'Choose Backup File'),
  'action.exportResultsCsv': pair('Xuất Kết Quả CSV', 'Export Results CSV'),
  'action.checkAgain': pair('Kiểm Tra Lại', 'Check Again'),
  'hint.faceFallback': pair(
    'Màn chiếu dùng Inter cho tên này vì Cinzel không có chữ tiếng Việt.',
    'The display sets this name in Inter: Cinzel has no Vietnamese letters.',
  ),
  'hint.faceCinzel': pair('Màn chiếu dùng Cinzel cho tên này.', 'The display sets this name in Cinzel.'),
  'hint.noTeamsYet': pair('Chưa có đội nào. Hãy thêm đội đầu tiên.', 'No teams yet. Add the first one.'),
  'hint.noMembers': pair('Đội này chưa có đoàn sinh.', 'No members on this team yet.'),
  'hint.namesOnePerLine': pair(
    'Dán danh sách, mỗi dòng một tên. Chỉ tên hiển thị, không cần tuổi hay liên lạc.',
    'Paste a list, one name per line. Display names only: no ages or contact details.',
  ),
  'hint.midGamePerforming': pair(
    'Đội mới vào cuối hàng trình diễn của vòng này, bắt đầu từ 0 điểm.',
    "A new team joins the end of this round's queue and starts at 0 points.",
  ),
  'hint.midGameNext': pair(
    'Đội mới bắt đầu từ vòng sau, với 0 điểm.',
    'A new team starts with the next round, at 0 points.',
  ),
  'hint.coGms': pair(
    'Chỉ cần tên, không có tài khoản hay mật khẩu.',
    'Names only: there are no accounts or passwords.',
  ),
  'hint.confirmRemoveTeam': pair(
    'Xóa {team}? {n} đoàn sinh của đội cũng bị xóa khỏi danh sách.',
    'Remove {team}? Its {n} roster names are removed too.',
  ),
  'hint.baseLocked': pair(
    'Điểm hoàn thành bị khóa khi sự kiện đã bắt đầu.',
    'Completion points are locked once the event starts.',
  ),
  'hint.roundStarted': pair(
    'Vòng này đã bắt đầu nên không sửa được nữa.',
    'This round has started, so it can no longer be changed.',
  ),
  'hint.estimateTeams': pair('Tính cho {n} đội.', 'Worked out for {n} teams.'),
  'hint.duration': pair('Thời gian ghi phút:giây, ví dụ 1:30.', 'Times are minutes and seconds, such as 1:30.'),
  'hint.reducedMotion': pair(
    'Không có vòng sáng, chớp hay cử chỉ; băng rôn hiện mờ dần.',
    'No rings, flashes or gestures; banners cross-fade.',
  ),
  'hint.sound': pair(
    'Tắt theo mặc định. Vòng cầu nguyện luôn im lặng.',
    'Off by default. The prayer round is always silent.',
  ),
  'hint.showMembers': pair(
    'Màn chào mừng liệt kê đoàn sinh của từng đội.',
    "The Welcome screen lists each team's members.",
  ),
  'hint.hostPin': pair(
    'Để trống là tắt. Chỉ hỏi khi rời Chế Độ Giám Khảo; không phải để bảo mật.',
    "Leave it blank for none. It is asked only when leaving Judge Mode; it isn't security.",
  ),
  'hint.awardCards': pair(
    'Thẻ giấy để Giám Khảo ghi điểm rồi đưa cho Quản Trò.',
    'Paper cards for co-GMs to note awards on and hand to the host.',
  ),
  'hint.printCards': pair('Nhấn Ctrl+P (hoặc ⌘P) để in.', 'Press Ctrl+P (or ⌘P) to print.'),
  'hint.popupBlocked': pair(
    'Trình duyệt đã chặn trang in. Hãy cho phép cửa sổ bật lên cho trang này.',
    'The browser blocked the print page. Allow pop-ups for this site.',
  ),
  'hint.imported': pair('Đã nhập bản sao lưu.', 'The backup is imported.'),
  'hint.deleteData': pair(
    'Xóa sự kiện đã lưu khỏi máy này. Hãy xuất bản sao lưu trước nếu cần giữ lại.',
    'Removes the saved event from this laptop. Export a backup first to keep it.',
  ),
  'hint.deleted': pair(
    'Đã xóa dữ liệu sự kiện; một sự kiện mới đã bắt đầu.',
    'The event data is deleted; a fresh event has started.',
  ),
  'hint.offlineNotChecked': pair(
    'Chưa kiểm tra. Hãy mở màn chiếu một lần trước.',
    'Not checked yet. Open the display once first.',
  ),
  'hint.offlineReady': pair(
    'Mọi thứ đã tải xong để chạy không cần mạng.',
    'Everything is loaded to run without the network.',
  ),
  'hint.offlineMissing': pair('Còn thiếu: {items}.', 'Still missing: {items}.'),

  // Hints and messages (sentences)
  'hint.reviewing': pair('Ban Giám Khảo đang duyệt điểm', 'HTs are reviewing'),
  'hint.projected': pair('Dự kiến · chưa công bố', 'Projected · not published'),
  'hint.judgeLocked': pair(
    'Đang duyệt điểm nên Chế Độ Giám Khảo đã khóa. Điểm đã thêm vẫn được giữ.',
    'Judge Mode is locked while the host reviews the round. Awards already added stay.',
  ),
  'hint.needStatusOne': pair('Còn 1 đội chưa có trạng thái.', '1 team needs a status.'),
  'hint.needStatusMany': pair('Còn {n} đội chưa có trạng thái.', '{n} teams need a status.'),
  'hint.estimateOver': pair(
    'Dự kiến {total} · vượt {over} so với mục tiêu {target}',
    'Estimated {total} · {over} over the {target} target',
  ),
  'hint.estimateWithin': pair(
    'Dự kiến {total} · trong mục tiêu {target}',
    'Estimated {total} · within the {target} target',
  ),
  'hint.revealEstimate': pair('Công bố dự kiến mất {time}', 'The reveal takes about {time}'),
  'hint.noIndividualYet': pair('Chưa có điểm cá nhân: {teams}', 'No individual awards yet: {teams}'),
  'hint.duplicate': pair(
    'Người nhận này đã có điểm cùng tên trong vòng này. Giữ lại kèm lý do?',
    'This recipient already has an award with this name this round. Keep it with a reason?',
  ),
  'hint.large': pair(
    'Lớn hơn điểm hoàn thành của vòng; sẽ được đánh dấu để duyệt.',
    "Larger than the round's completion points, so it is flagged for review.",
  ),
  'hint.privateNote': pair(
    'Chỉ Huynh Trưởng thấy; không bao giờ hiện trên màn chiếu.',
    'Only HTs see this; it never appears on the display.',
  ),
  'hint.correctionReason': pair('Lý do công khai, sẽ hiện trên màn chiếu.', 'A public reason, shown on the display.'),
  'hint.timeUp': pair(
    'Hết giờ. Quản Trò quyết định bước tiếp theo.',
    'Time is up. The host decides what happens next.',
  ),
  'hint.resume': pair('Tiếp tục sự kiện: {round}, {phase}', 'Resume the event: {round}, {phase}'),
  'hint.storageRefused': pair(
    'Trình duyệt không cho lưu. Trò chơi vẫn tiếp tục; hãy xuất bản sao lưu.',
    'This browser refused to save. Play continues; export a backup to keep the event safe.',
  ),
  'hint.otherHost': pair(
    'Bảng điều khiển Quản Trò đang mở ở một thẻ khác.',
    'The host console is already open in another tab.',
  ),
  'hint.takenOver': pair(
    'Bảng điều khiển Quản Trò đã được tiếp quản ở một thẻ khác.',
    'Another tab took over the host console.',
  ),
  'hint.otherHostGone': pair(
    'Thẻ Quản Trò kia đã đóng. Hãy tiếp quản để tiếp tục.',
    'The other host tab has closed. Take over to carry on.',
  ),
  'hint.importSummary': pair(
    'Bản sao lưu có {teams} đội và {published} vòng đã công bố. Nhập sẽ thay thế sự kiện hiện tại.',
    'This backup has {teams} teams and {published} published rounds. Importing replaces the current event.',
  ),
  'hint.noWebgl': pair(
    'Màn chiếu không hỗ trợ WebGL nên hiện ảnh tĩnh của lửa trại.',
    'The display has no WebGL, so it shows a still of the bonfire.',
  ),
  'hint.confirmPublish': pair(
    'Công bố vòng này? Sau đó kết quả chỉ có thể đính chính, không sửa được.',
    "Publish this round? Afterwards the result can't be edited, only corrected.",
  ),
  'hint.confirmSkip': pair(
    'Bỏ qua vòng này? Điểm chưa công bố sẽ bị hủy và vòng tính 0 điểm.',
    'Skip this round? Its unpublished awards are discarded and it counts zero.',
  ),
  'hint.confirmEnd': pair(
    'Kết thúc sự kiện? Vòng chưa công bố sẽ tính 0 điểm.',
    'End the event? A round not yet published counts zero.',
  ),
  'hint.confirmImport': pair(
    'Nhập bản sao lưu? Sự kiện hiện tại sẽ bị thay thế.',
    'Import this backup? It replaces the current event.',
  ),
  'hint.confirmDelete': pair(
    'Xóa sự kiện khỏi máy này? Không thể hoàn tác.',
    "Delete the event from this laptop? This can't be undone.",
  ),
  'hint.offline': pair(
    'Hãy mở trang khi có mạng và đừng đóng trình duyệt.',
    "Load the page while online, then don't close the browser.",
  ),

  // The projector checklist (sentences)
  'check.extend': pair(
    'Đặt màn hình ở chế độ Mở Rộng (Extend), không phải Nhân Bản (Mirror)',
    'Set your display to Extend, not Mirror',
  ),
  'check.drag': pair('Kéo trang này sang máy chiếu', 'Drag this page to the projector'),
  'check.fullScreen': pair('Nhấn Toàn Màn Hình', 'Press Full Screen'),

  // Errors, by ERROR_CODES (sentences)
  'error.bad_command': pair('Lệnh này thiếu thông tin.', 'That command is incomplete.'),
  'error.unknown_command': pair('Lệnh này không xác định.', "That command isn't known."),
  'error.bad_payload': pair('Thiếu thông tin hoặc sai kiểu dữ liệu.', 'Some details are missing or of the wrong kind.'),
  'error.forbidden': pair('Vai trò này không được làm việc đó.', "This role can't do that."),
  'error.wrong_phase': pair('Không thể làm việc đó ở giai đoạn này.', "That isn't possible in this phase."),
  'error.not_found': pair('Không tìm thấy mục này.', 'That item no longer exists.'),
  'error.invalid_name': pair('Hãy nhập tên, không quá giới hạn ký tự.', 'Enter a name within the character limit.'),
  'error.invalid_text': pair('Văn bản quá dài.', 'That text is too long.'),
  'error.invalid_points': pair(
    'Hãy nhập số điểm nguyên, ví dụ +50 hoặc −25.',
    'Enter whole points, such as +50 or −25.',
  ),
  'error.invalid_duration': pair('Thời gian không hợp lệ.', 'That duration is out of range.'),
  'error.invalid_status': pair('Hãy chọn Hoàn Thành, Bỏ Lượt hoặc Vắng Mặt.', 'Choose Complete, Passed or Absent.'),
  'error.invalid_config': pair('Thiết lập này không có trong các lựa chọn.', "That setting isn't one of the choices."),
  'error.unsafe_total': pair(
    'Tổng điểm sẽ quá lớn để tính chính xác.',
    'That would make a total too large to count exactly.',
  ),
  'error.no_recipients': pair('Hãy chọn ít nhất một người nhận.', 'Choose at least one recipient.'),
  'error.duplicate_award': pair(
    'Người nhận này đã có điểm cùng tên trong vòng này; nhập lý do để giữ lại.',
    'This recipient already has an award with this name this round; add a reason to keep it.',
  ),
  'error.invalid_reason': pair(
    'Hãy nhập lý do, không quá giới hạn ký tự.',
    'Enter a reason within the character limit.',
  ),
  'error.zero_correction': pair('Đính chính phải khác 0 điểm.', "A correction can't be zero points."),
  'error.judging_closed': pair('Chấm điểm đã đóng cho vòng này.', 'Judging is closed for this round.'),
  'error.not_own_award': pair('Bạn chỉ sửa được điểm do mình cho.', 'You can only change your own awards.'),
  'error.not_draft': pair('Điểm này đã được công bố hoặc đã xóa.', 'This award is already published or removed.'),
  'error.status_unset': pair(
    'Mỗi đội cần có trạng thái trước khi công bố.',
    'Every team needs a status before publishing.',
  ),
  'error.already_published': pair('Vòng này đã được công bố.', 'This round is already published.'),
  'error.locked': pair(
    'Mục này đã khóa khi sự kiện hoặc vòng bắt đầu.',
    'This is locked once the event or round has started.',
  ),
  'error.no_teams': pair('Cần ít nhất một đội để bắt đầu.', 'Add at least one team to start.'),
  'error.no_next_team': pair('Tất cả các đội đã trình diễn.', 'Every team has performed.'),
  'error.no_more_rounds': pair('Không còn vòng nào.', 'There are no more rounds.'),
  'error.timer_state': pair('Đồng hồ không ở trạng thái phù hợp.', "The timer isn't in the right state for that."),
  'error.host_required': pair('Sự kiện luôn cần một Quản Trò.', 'The event always needs a host.'),
  'error.storage_unavailable': pair('Không truy cập được bộ nhớ trình duyệt.', "Browser storage isn't available."),
  'error.storage_failed': pair('Trình duyệt từ chối lưu.', 'The browser refused to save.'),
  'error.bad_json': pair('Không đọc được tệp này.', "That file can't be read."),
  'error.bad_backup': pair('Tệp này không phải bản sao lưu sự kiện.', "That file isn't an event backup."),
  'error.newer_version': pair(
    'Bản sao lưu này được tạo bởi phiên bản mới hơn.',
    'This backup was saved by a newer version of the game.',
  ),

  // Judge Mode (judge.js)
  'label.whoIsJudging': pair('Ai Đang Chấm Điểm?', 'Who Is Judging?'),
  'label.judgeLocked': pair('Chế Độ Giám Khảo Đã Khóa', 'Judge Mode Is Locked'),
  'label.chooseRecipient': pair('Chọn Người Nhận', 'Choose a Recipient'),
  'action.continueAs': pair('Tiếp Tục Với {name}', 'Continue As {name}'),
  'action.changeGm': pair('Đổi Người Chấm', 'Change Name'),
  'action.returnToConsole': pair('Về Bảng Điều Khiển', 'Return To Console'),
  'hint.pickGm': pair(
    'Chọn tên của bạn để điểm bạn cho được ghi đúng người.',
    'Pick your name so the awards you give are credited to you.',
  ),
  'hint.noCoGms': pair(
    'Chưa có giám khảo nào. Quản Trò thêm giám khảo ở tab Đội & Danh Sách.',
    'No co-GMs yet. The host adds them in Teams & Roster.',
  ),
  'hint.judgeRoundOver': pair(
    'Đã chấm xong vòng này. Chế Độ Giám Khảo mở lại khi vòng sau bắt đầu chuẩn bị.',
    "This round's judging is over. Judge Mode opens again when the next round's preparation starts.",
  ),
  'hint.noMyAwards': pair('Bạn chưa cho điểm nào trong vòng này.', "You haven't given any awards this round."),
  'hint.noOthersAwards': pair('Chưa có điểm nào khác trong vòng này.', 'No other awards this round yet.'),
  'hint.pinToLeave': pair(
    'Nhập mã PIN của Quản Trò để trở về bảng điều khiển.',
    'Enter the host PIN to return to the host console.',
  ),
  'hint.wrongPin': pair('Mã PIN không đúng. Hãy thử lại.', "That PIN isn't right. Try again."),
  // The Review and History tabs (hostReview.js): teams side by side, flags, publishing, corrections, totals
  'label.flags': pair('Cần Xem Lại', 'Flags'),
  'label.duplicate': pair('Trùng Tên', 'Duplicate'),
  'label.keptBecause': pair('Giữ Lại: {reason}', 'Kept: {reason}'),
  'label.statusCount': pair('{done}/{total} Đội Đã Có Trạng Thái', '{done} Of {total} Teams Have a Status'),
  'label.teamAwards': pair('Điều Chỉnh Cho Đội', 'Team Awards'),
  'label.individualAwards': pair('Điều Chỉnh Cá Nhân', 'Individual Awards'),
  'label.fromName': pair('Từ {name}', 'From {name}'),
  'label.otherRecipients': pair('Người Nhận Khác', 'Other Recipients'),
  'label.publishedRounds': pair('Các Vòng Đã Công Bố', 'Published Rounds'),
  'label.atEventTime': pair('Phút {time} Của Sự Kiện', 'At {time} Into the Event'),
  'label.recipient': pair('Người Nhận', 'Recipient'),
  'label.difference': pair('Chênh Lệch', 'Difference'),
  'label.publicReason': pair('Lý Do Công Khai', 'Public Reason'),
  'label.noRound': pair('Không Gắn Với Vòng', 'No Round'),
  'label.noOriginal': pair('Không Có Mục Gốc', 'No Original Entry'),
  'label.chooseOne': pair('Chọn…', 'Choose…'),
  'label.totalChange': pair('Tổng: {before} → {after}', 'Total: {before} → {after}'),
  'label.correctsEntry': pair('Đính Chính Cho: {name}', 'Corrects: {name}'),
  'label.removedMember': pair('Đã Rời Danh Sách', 'Removed From Roster'),
  'hint.reviewIdle': pair(
    'Khi một vòng bắt đầu, các đội sẽ hiện ở đây cạnh nhau để so sánh.',
    'Once a round starts, its teams appear here side by side.',
  ),
  'hint.reviewNotYet': pair(
    'Chọn Duyệt Điểm Vòng để khóa Chế Độ Giám Khảo rồi công bố.',
    'Choose Review Round to lock Judge Mode, then publish.',
  ),
  'hint.reviewClear': pair('Không có gì cần xem lại.', 'Nothing is flagged.'),
  'hint.reopen': pair(
    'Mở lại để Giám Khảo tiếp tục ghi điểm; điểm đã thêm vẫn được giữ.',
    'Reopen so co-GMs can add awards again; nothing added is lost.',
  ),
  'hint.noStatus': pair('Chưa có trạng thái: {teams}.', 'No status yet: {teams}.'),
  'hint.duplicateGroup': pair('{name} có {n} điểm trùng tên “{award}”.', '{name} has {n} awards named “{award}”.'),
  'hint.largeAward': pair(
    '{name}: {points} lớn hơn {base} điểm hoàn thành.',
    '{name}: {points} is more than the {base} completion points.',
  ),
  'hint.historyEmpty': pair('Chưa có vòng nào được công bố.', 'No round is published yet.'),
  'hint.noCorrections': pair('Chưa có đính chính nào.', 'No corrections yet.'),
  'hint.correction': pair(
    'Đính chính cộng hoặc trừ phần chênh lệch; điểm hoàn thành không bao giờ được tính lại.',
    'A correction adds or subtracts the difference; completion points are never applied again.',
  ),
  'hint.correctionsLater': pair('Có thể đính chính khi sự kiện đã bắt đầu.', 'Corrections open once the event starts.'),
  'hint.correctionAdded': pair('Đã thêm đính chính cho {name}.', 'Correction added for {name}.'),
  'hint.originalEntry': pair(
    'Tùy chọn: điểm đã công bố mà đính chính này sửa.',
    'Optional: the published award this corrects.',
  ),
  'hint.hostOnlyRanking': pair(
    'Chỉ Quản Trò thấy bảng này; màn chiếu chỉ tôn vinh các cá nhân dẫn đầu.',
    'Only the host sees this list; the display celebrates the leading individuals only.',
  ),

  // The shared display (display.js): Welcome, the standings' movement, the test pattern, waiting
  'label.roundsN': pair('{n} Vòng', '{n} Rounds'),
  'label.movedUp': pair('Lên {n} Hạng', 'Up {n}'),
  'label.movedDown': pair('Xuống {n} Hạng', 'Down {n}'),
  'label.noMove': pair('Giữ Hạng', 'No Change'),
  'label.testPattern': pair('Mẫu Kiểm Tra', 'Test Pattern'),
  'label.sampleTeam': pair('Đội Phaolô', 'Team Paul'),
  'label.sampleAward': pair('Cùng Nhau Tỏa Sáng', 'Shine Together'),
  'hint.displayWaiting': pair('Đang chờ bảng điều khiển của Quản Trò.', 'Waiting for the host console.'),

  // The host console put together (host.js): resuming, Skip Round, the projector checklist
  'action.hideTestPattern': pair('Ẩn Mẫu Kiểm Tra', 'Hide Test Pattern'),
  'hint.resumeTimeUp': pair(
    'Tiếp tục sự kiện: {round}, {phase}. Đồng hồ đã hết giờ trong lúc đóng trang.',
    'Resume the event: {round}, {phase}. The timer ran out while the console was closed.',
  ),
  'hint.skipRound': pair(
    'Bỏ qua vòng này: vòng tính 0 điểm và không có phần công bố.',
    'Skip this round: it counts zero and has no reveal.',
  ),
  'hint.checklist': pair(
    'Làm theo các bước này một lần, khi màn chiếu đã mở.',
    'Go through these steps once the display is open.',
  ),
  'hint.testPattern': pair(
    'Đứng ở cuối phòng và kiểm tra xem tiêu đề, băng rôn và đồng hồ có đọc được không.',
    'Stand at the back of the room and check the title, the banner and the timer are readable.',
  ),

  // Review fixes: Enter, the reveal's end, warnings, unreadable saves, accessible names
  'label.minus': pair('Dấu Trừ', 'Minus'),
  'label.plus': pair('Dấu Cộng', 'Plus'),
  'label.filterShortcuts': pair('Lọc Phím Tắt', 'Filter Shortcuts'),
  'action.downloadUnreadable': pair('Tải Bản Lưu Không Đọc Được', 'Download Unreadable Save'),
  'hint.storageWarning': pair(
    'Chưa lưu được: trình duyệt từ chối lưu (cửa sổ ẩn danh hoặc bộ nhớ đầy). Trò chơi vẫn tiếp tục; hãy xuất bản sao lưu trước khi đóng thẻ.',
    'Not saved: this browser refused storage (private browsing, or full). Play continues; export a backup before closing the tab.',
  ),
  'hint.unsavedHere': pair(
    'Cửa sổ này có thay đổi chưa được lưu. Hãy xuất bản sao lưu trước khi đóng.',
    'This tab has changes that were never saved. Export a backup before closing it.',
  ),
  'hint.offlineKeepOpen': pair(
    'Hãy mở trang khi có mạng, rồi đừng đóng trình duyệt hay cửa sổ màn chiếu.',
    'Load the page while online, then close neither the browser nor the display.',
  ),
  'hint.reopenNeedsNetwork': pair('Mở lại màn chiếu cần có mạng.', 'Reopening the display needs the network.'),
  'hint.reopenDisplay': pair(
    'Cửa sổ màn chiếu đã đóng. Mở Cửa Sổ Màn Chiếu để hiện lại đúng chỗ sự kiện đang diễn ra.',
    'The display was closed. Open Display Window brings it back where the event is.',
  ),
  'check.keepOpen': pair(
    'Đừng đóng cửa sổ màn chiếu: khi mất mạng sẽ không mở lại được',
    "Don't close the display: without the network it can't be reopened",
  ),
  'hint.unreadable.newer_version': pair(
    'Sự kiện đã lưu được tạo bởi một phiên bản mới hơn nên không đọc được ở đây.',
    "The saved event was written by a newer version and can't be read here.",
  ),
  'hint.unreadable.bad_json': pair(
    'Sự kiện đã lưu bị hỏng nên không đọc được.',
    "The saved event is damaged and can't be read.",
  ),
  'hint.unreadable.bad_backup': pair(
    'Dữ liệu đã lưu không phải là một sự kiện lửa trại.',
    "The saved data isn't a campfire event.",
  ),
  'hint.unreadableKept': pair(
    '{why} Bản lưu được giữ nguyên ở một chỗ khác; đây là sự kiện mới.',
    '{why} It was kept aside, untouched; this is a new event.',
  ),
  'hint.unreadableHeld': pair(
    '{why} Bản lưu được giữ nguyên nên sự kiện mới này chưa được lưu. Hãy tải nó xuống, hoặc Xóa Dữ Liệu Sự Kiện để lưu tiếp.',
    "{why} It is kept untouched, so this new event isn't saved. Download it, or Delete Event Data to start saving.",
  ),
  'hint.eventFinished': pair(
    'Sự kiện đã kết thúc. Hãy xuất kết quả và bản sao lưu; xóa dữ liệu khi không còn cần.',
    'The event is finished. Export the results and a backup; delete the event data once it is no longer needed.',
  ),
});

const own = Object.prototype.hasOwnProperty;

/**
 * Two texts joined as a display mode or language wants them: 'bilingual' → 'vi · en',
 * 'en-first' → 'en · vi', 'vi-only' or 'vi' → vi, 'en' → en. An empty side falls back to the
 * other, and two equal texts are shown once (so a name without a translation has no dangling dot).
 * @param {string} vi
 * @param {string} en
 * @param {Lang|DisplayMode} [mode] defaults to 'en'
 * @returns {string}
 */
export function bilingual(vi, en, mode) {
  const a = typeof vi === 'string' ? vi : '';
  const b = typeof en === 'string' ? en : '';
  if (!a || !b || a === b) return a || b;
  if (mode === 'bilingual') return a + JOIN + b;
  if (mode === 'en-first') return b + JOIN + a;
  if (mode === 'vi' || mode === 'vi-only') return a;
  return b;
}

/**
 * The string for `key` in `lang` (or both, joined, for the 'bilingual' and 'en-first' display
 * modes); the key itself when it's missing. An unknown language gives the English.
 * @param {string} key
 * @param {Lang|DisplayMode} lang
 * @returns {string}
 */
export function t(key, lang) {
  if (typeof key !== 'string') return '';
  if (!own.call(STRINGS, key)) return key;
  const entry = STRINGS[key];
  return bilingual(entry.vi, entry.en, lang);
}

/**
 * A template's `{name}` placeholders filled from `vars`; a placeholder with no value stays as is.
 * @param {string} text
 * @param {Record<string, string|number>} vars
 * @returns {string}
 */
export function fill(text, vars) {
  return String(text).replace(/\{(\w+)\}/g, (whole, name) =>
    vars && own.call(vars, name) ? String(vars[name]) : whole,
  );
}

/** A finite number as a whole one, -0 as 0; anything else as 0. @param {number} n */
const whole = (n) => (Number.isFinite(n) ? Math.round(n) || 0 : 0);

/** @param {unknown} lang @returns {Lang} */
const langOf = (lang) => (lang === 'vi' ? 'vi' : 'en');

/**
 * Signed points with their unit: '+75 Team Points', '−25 Individual Points', '+25 Each' (plain
 * with `each`), '+50' (plain), and zero with a unit as 'Recognition · 0 Points'. Never shows a
 * deduction as positive. Vietnamese units come from STRINGS.
 * @param {number} points a safe integer
 * @param {{ unit?: 'team'|'individual'|'plain', each?: boolean, lang?: Lang }} [opts] unit defaults
 *   to 'plain', lang to 'en'
 * @returns {string}
 */
export function formatPoints(points, opts = {}) {
  const lang = langOf(opts.lang);
  const unit = opts.unit === 'team' || opts.unit === 'individual' ? opts.unit : 'plain';
  const n = whole(points);
  const eachKey = unit === 'team' ? 'unit.eachTeam' : unit === 'individual' ? 'unit.eachPerson' : 'unit.each';
  const tail = opts.each ? ' ' + t(eachKey, lang) : '';
  if (n === 0 && unit !== 'plain') {
    return `${t('unit.recognition', lang)}${JOIN}0 ${t('unit.points', lang)}${tail}`;
  }
  const sign = n > 0 ? '+' : n < 0 ? MINUS : '';
  const unitText =
    unit === 'team'
      ? ' ' + t('unit.teamPoints', lang)
      : unit === 'individual'
        ? ' ' + t('unit.individualPoints', lang)
        : '';
  return `${sign}${group(Math.abs(n), lang)}${unitText}${tail}`;
}

/**
 * A non-negative whole number with its thousands grouped: ',' in English, '.' in Vietnamese.
 * @param {number} abs
 * @param {Lang} lang
 */
function group(abs, lang) {
  return String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'vi' ? '.' : ',');
}

/**
 * A number without a forced sign, thousands grouped ('1,040' in English, '1.040' in Vietnamese),
 * negatives with U+2212. Fractions round; non-finite numbers show as '0'.
 * @param {number} n
 * @param {Lang} [lang] defaults to 'en'
 * @returns {string}
 */
export function formatNumber(n, lang) {
  const v = whole(n);
  return (v < 0 ? MINUS : '') + group(Math.abs(v), langOf(lang));
}

/**
 * A countdown or duration as 'm:ss' ('1:12', '0:00', '62:00'): rounded up to the whole second
 * (a countdown shows 0:01 until it really ends), negatives and non-numbers as '0:00'.
 * @param {number} ms
 * @returns {string}
 */
export function formatClock(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return '0:00';
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/**
 * A typed amount: optional '+', '-' or '−' (U+2212), ASCII digits, surrounding spaces allowed.
 * Returns a safe integer (never -0), or null for anything else (blank, fractions, grouped
 * thousands, '1e3', out of range).
 * @param {string} text
 * @returns {number|null}
 */
export function parsePoints(text) {
  if (typeof text !== 'string') return null;
  const m = /^\s*([+\-−]?)([0-9]+)\s*$/.exec(text);
  if (!m) return null;
  const n = Number(m[2]);
  if (!Number.isSafeInteger(n)) return null;
  return m[1] === '-' || m[1] === MINUS ? -n || 0 : n;
}

/**
 * A name or text as stored: NFC, trimmed, runs of whitespace collapsed to one space; a non-string
 * gives ''.
 * @param {unknown} s
 * @returns {string}
 */
export function cleanText(s) {
  if (typeof s !== 'string') return '';
  return s.normalize('NFC').replace(/\s+/g, ' ').trim();
}

/**
 * The key two award names are compared by (case- and accent-insensitive): NFD, combining marks
 * stripped, đ/Đ → d, trimmed, whitespace collapsed, lowercased. 'Sáng  Tạo ' and 'sang tao' match.
 * @param {unknown} s
 * @returns {string}
 */
export function normalizeName(s) {
  if (typeof s !== 'string') return '';
  return s.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').replace(/\s+/g, ' ').trim().toLowerCase();
}
