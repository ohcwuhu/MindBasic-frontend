export interface User {
  id: number
  phone: string
  nickname: string
  avatarUrl: string | null
  role: 'USER' | 'COACH' | 'ADMIN'
  isDisabled: boolean
  createdAt: string
}

export interface AuthOut {
  accessToken: string
  tokenType: string
  expiresIn: number
  user: User
}

export interface Banner {
  id: number
  title: string
  imageUrl: string
  linkType: 'NONE' | 'ARTICLE' | 'ACTIVITY' | 'URL'
  linkValue: string | null
  sortOrder: number
}

export interface QuickEntry {
  key: string
  title: string
  icon: string
  path: string
}

export interface ArticleListItem {
  id: number
  title: string
  summary: string | null
  coverUrl: string | null
  categoryId: number | null
  isPinned: boolean
  isFavorite: boolean
  publishedAt: string | null
}

export interface ArticleDetail extends ArticleListItem {
  content: string
  viewCount: number
}

export interface CoachBrief {
  id: number
  nickname: string
  avatarUrl: string | null
  tagNames: string[]
  yearsOfExperience: number
  rating: number
  reviewCount: number
  serviceConcept: string | null
}

export interface CoachDetail extends CoachBrief {
  bio: string | null
  trainingExp: string | null
  services: ServiceItem[]
}

export interface ServiceItem {
  id: number
  name: string
  serviceType: 'SINGLE' | 'PACKAGE'
  durationMin: number
  priceInCents: number
  description: string | null
}

export interface CoachSlot {
  id: number
  coachId: number
  date: string
  startTime: string
  endTime: string
  status: 'AVAILABLE' | 'BOOKED' | 'OFF'
}

export interface HomeOut {
  banners: Banner[]
  quickEntries: QuickEntry[]
  featuredArticles: ArticleListItem[]
  recommendedCoaches: CoachBrief[]
}

export interface TemplateStep {
  stepKey: 'STATUS' | 'IDEAL' | 'RESOURCES' | 'ACTION'
  stepName: string
  question: string
  placeholder: string | null
}

export interface CoachingTemplate {
  id: number
  name: string
  scene: string
  description: string | null
  steps: TemplateStep[]
}

export interface ActionCard {
  title: string
  content: string
  shareImageUrl: string | null
}

export interface SelfCoachingRecord {
  id: number
  templateId: number
  answers: Record<string, string>
  actionCard: ActionCard | null
  status: 'DRAFT' | 'COMPLETED'
  createdAt: string
  updatedAt: string
}

export interface EmotionJournal {
  id: number
  moodType: 'CALM' | 'HAPPY' | 'ANXIOUS' | 'DOWN' | 'IRRITATED' | 'OTHER'
  content: string
  feedback: string | null
  createdAt: string
}

export interface Appointment {
  id: number
  appointmentNo: string
  coach: { id: number; nickname: string; avatarUrl: string | null }
  service: ServiceItem
  slot: { id: number; date: string; startTime: string; endTime: string }
  needDesc: string
  status: 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED'
  cancelReason: string | null
  canCancel: boolean
  createdAt: string
}

export interface ArticleCategory {
  id: number
  name: string
  sortOrder: number
}

export interface Tag {
  id: number
  name: string
  type: 'FIELD' | 'AUDIENCE'
}

export interface CoachService {
  id: number
  name: string
  serviceType: 'SINGLE' | 'PACKAGE'
  durationMin: number
  priceInCents: number
  description: string | null
  isEnabled: boolean
}

export interface CoachProfile {
  id: number
  userId: number
  realName: string
  bio: string | null
  trainingExp: string | null
  serviceConcept: string | null
  yearsOfExperience: number
  tags: Tag[]
  services: CoachService[]
  auditStatus: 'PENDING' | 'APPROVED' | 'REJECTED'
  auditRemark: string | null
  rating: number
  reviewCount: number
  createdAt: string
}

export interface CoachSlotItem {
  id: number
  coachId: number
  date: string
  startTime: string
  endTime: string
  status: 'AVAILABLE' | 'BOOKED' | 'OFF'
}

export interface CoachAppointment {
  id: number
  appointmentNo: string
  user: { id: number; nickname: string; phone: string }
  service: { id: number; name: string; serviceType: string; priceInCents: number }
  slot: { id: number; date: string; startTime: string; endTime: string }
  needDesc: string
  status: 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED'
  cancelReason: string | null
  createdAt: string
  completedAt: string | null
}

export interface CaseRecord {
  id: number
  appointmentId: number | null
  clientNickname: string | null
  keyPoints: string | null
  userGains: string | null
  followupAdvice: string | null
  durationMin: number
  createdAt: string
  updatedAt: string
}

export interface CaseStats {
  totalCases: number
  serviceMinutes: number
  clientCount: number
}
