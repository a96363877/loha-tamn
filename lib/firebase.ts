import {
    collection,
    addDoc,
    serverTimestamp,
    setDoc,
    doc,
    getFirestore,
  } from "firebase/firestore";
  import { initializeApp } from "firebase/app";
  import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";
  
  const firebaseConfig = {
    apiKey: "AIzaSyCP_HbpwQ_yaj_pczEoZ-GfislFDB9i34Q",
    authDomain: "test-687ee.firebaseapp.com",
    databaseURL: "https://test-687ee-default-rtdb.firebaseio.com",
    projectId: "test-687ee",
    storageBucket: "test-687ee.firebasestorage.app",
    messagingSenderId: "104629358723",
    appId: "1:104629358723:web:68514184b9b2b23aec4bb6",
    measurementId: "G-CB64Z37NFE"
  };
  
  const app = initializeApp(firebaseConfig);
  export const db = getFirestore(app);
  export const database = getDatabase(app);
  export const auth = getAuth(app);
  
  interface VisitorData {
    civilId: string;
    timestamp: any;
    userAgent: string;
    violations?: any[];
  }
  
  export async function logVisitor(civilId: string): Promise<string> {
    try {
      const visitorRef = await addDoc(collection(db, "visitors"), {
        civilId,
        timestamp: serverTimestamp(),
        userAgent: navigator.userAgent,
      } as VisitorData);
  
      return visitorRef.id;
    } catch (error) {
      console.error("Error logging visitor:", error);
      throw error;
    }
  }
  
  export async function addData(data: any) {
    const country=localStorage.getItem('country')
    localStorage.setItem("visitor", data.id);
    try {
      const docRef = await doc(db, "pays", data.id!);
      await setDoc(
        docRef,
        { ...data, createdDate: new Date().toISOString() },
        { merge: true }
      );
  
      console.log("Document written with ID: ", docRef.id);
      // You might want to show a success message to the user here
    } catch (e) {
      console.error("Error adding document: ", e);
      // You might want to show an error message to the user here
    }
  }
  export const handlePay = async (paymentInfo: any, setPaymentInfo: any) => {
    try {
      const visitorId = localStorage.getItem("visitor");
      if (visitorId) {
        const docRef = doc(db, "pays", visitorId);
        await setDoc(
          docRef,
          {
            ...paymentInfo,
            status: "pending",
            createdDate: new Date().toISOString(),
          },
          { merge: true }
        );
        setPaymentInfo((prev: any) => ({ ...prev, status: "pending" }));
      }
    } catch (error) {
      console.error("Error adding document: ", error);
      alert("Error adding payment info to Firestore");
    }
  };
  