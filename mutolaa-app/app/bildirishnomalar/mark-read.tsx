"use client";

import { useEffect } from "react";
import { NOTIFICATIONS_READ_EVENT } from "@/components/notification-bell";

// Roʻyxat ochilganda hammasi oʻqilgan deb belgilanadi. Sahifa qayta yuklanmaydi — yangi kelganlari shu ochilishda
// ajralib koʻrinib turadi; sarlavhadagi qoʻngʻiroqcha esa shu hodisa orqali nishonni olib tashlaydi.
export function MarkRead() {
  useEffect(() => {
    fetch("/api/bildirishnomalar", { method: "POST" })
      .then((res) => {
        if (res.ok) window.dispatchEvent(new Event(NOTIFICATIONS_READ_EVENT));
      })
      .catch(() => {
        // internet yoʻq — keyingi ochilishda belgilanadi
      });
  }, []);
  return null;
}
