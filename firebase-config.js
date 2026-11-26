// Import the functions you need from the SDKs you need

import { initializeApp } from "firebase/app";

// TODO: Add SDKs for Firebase products that you want to use

// https://firebase.google.com/docs/web/setup#available-libraries


// Your web app's Firebase configuration

const firebaseConfig = {

  apiKey: "AIzaSyDQU4A3u7z_9jN3hy3uxMsLvPLjwLGEHWU",

  authDomain: "radar-microbit.firebaseapp.com",

  databaseURL: "https://radar-microbit-default-rtdb.europe-west1.firebasedatabase.app",

  projectId: "radar-microbit",

  storageBucket: "radar-microbit.firebasestorage.app",

  messagingSenderId: "610275778520",

  appId: "1:610275778520:web:98cb46d602e5852f1a5cad"

};


// Initialize Firebase

const app = initializeApp(firebaseConfig);
