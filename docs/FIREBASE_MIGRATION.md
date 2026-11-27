# Firebase, Firestore და Cloud Storage-ზე გადაყვანის არქიტექტურული გზამკვლევი

> **მნიშვნელოვანი გაფრთხილება:** მიმდინარე MVP ვერსია მუშაობს მხოლოდ ლოკალურად ბრაუზერში (IndexedDB / Dexie). ლოკალური პაროლები, როლები, ფაილები და აქტივობის ჟურნალი **არ წარმოადგენს** სერვერულად დაცულ უსაფრთხოების საზღვარს. რეალური პაციენტების მონაცემების შეყვანამდე და თანამშრომლების ქსელური დაშვების ჩართვამდე აუცილებელია ქვემოთ აღწერილი სერვერული ინფრასტრუქტურის დანერგვა.

## 1. არქიტექტურული ფენები (უკვე გამზადებული აბსტრაქცია)
აპლიკაციაში მონაცემთა წვდომა გამიჯნულია UI-სგან:
- `src/repositories/DataRepository.ts` (`IDataRepository` ინტერფეისი, `DexieRepository` და `FirestoreRepository` შაბლონი)
- `src/auth/AuthService.ts` (`IAuthAdapter` ინტერფეისი, `LocalAuthAdapter` და `FirebaseAuthAdapter` შაბლონი)
- `src/storage/StorageProvider.ts` (`IStorageProvider` ინტერფეისი, `IndexedDbStorageProvider` და `CloudStorageProvider` შაბლონი)

## 2. Firestore კოლექციების სტრუქტურა
ყველა ჩანაწერი უკვე იყენებს უნიკალურ `id` (UUID), `createdAt`, `updatedAt`, `createdBy`, `updatedBy`, `deletedAt` ველებს:
- `users/{uid}` — თანამშრომლის პროფილი და როლი (`role: 'admin' | 'supervisor' | 'inspector' | 'viewer'`, `isActive: boolean`)
- `settings/singleton` — კატეგორიები, სტატუსები, ვადების კონფიგურაცია, customFields, rolePermissions
- `counters/case_sequence_{YYYY}` — ტრანზაქციული მთვლელი `CASE-YYYY-XXXXXX` ნომრებისთვის
- `cases/{caseId}` — ძირითადი ქეისი
- `cases/{caseId}/sub_participants/{id}` ან root კოლექცია `case_participants/{id}` (`caseId` ინდექსით)
- `applicants/{id}`, `patients/{id}` (განსაკუთრებული კატეგორიის მონაცემები დაცული subcollection-ით ან სერვერული წესით)
- `organizations/{id}`, `doctors/{id}`, `reviewers/{id}`, `commissions/{id}` — საერთო ცნობარები
- `case_organizations/{id}`, `case_doctors/{id}`, `case_commissions/{id}`, `case_links/{id}` — მრავალი-მრავალთან კავშირები
- `visits/{id}`, `inspection_acts/{id}`, `orders/{id}`
- `document_requests/{id}`, `correspondence/{id}`, `review_assignments/{id}`
- `tasks/{id}`, `reminders/{id}`, `attachments/{id}`, `comments/{id}`
- `activity_logs/{id}` — მხოლოდ ჩამატებადი (append-only) სერვერული აუდიტი

## 3. უნიკალური შიდა ნომრების გენერაცია სერვერზე
ლოკალურად ნომერი გენერირდება IndexedDB ტრანზაქციით. Firebase-ზე გადასვლისას გამოიყენეთ Cloud Function (`onCall` ან Firestore Transaction `counters/case_sequence_{YYYY}` დოკუმენტზე), რათა ორმა პარალელურმა მომხმარებელმა არ მიიღოს ერთი და იგივე `CASE-2026-XXXXXX` ნომერი.

## 4. ლოკალური მონაცემების მიგრაცია Firebase-ში
1. გააკეთეთ სრული **JSON/ZIP სარეზერვო ექსპორტი** „პარამეტრები → მონაცემების ექსპორტი/იმპორტი“-დან.
2. ჩართეთ Firebase Auth და შექმენით რეალური ანგარიშები (Email/Password ან ორგანიზაციული SSO).
3. გაუშვით ადმინისტრატორის მიგრაციის სკრიპტი (Firebase Admin SDK), რომელიც:
   - გადაამოწმებს UUID-ებს (idempotent `set(..., { merge: false })` რათა არ მოხდეს დუბლირება);
   - დაუკავშირებს ძველ `createdBy` / `assignedTo` მომხმარებლის ID-ებს ახალ Firebase Auth `uid`-ებთან mapping ცხრილით (`legacyUsername -> firebaseUid`);
   - ატვირთავს ZIP არქივში არსებულ ფაილებს კერძო Cloud Storage ბაკეტში (`cases/{caseId}/{attachmentId}/{fileName}`);
   - შეინახავს `counters/case_sequence_{YYYY}` მნიშვნელობას მიმდინარე მაქსიმალურ ნომერზე.

## 5. ფაილების უსაფრთხო შენახვა (Firebase Storage / Backblaze B2)
- ყველა ობიექტი უნდა იყოს **კერძო** (Public access გამორთული).
- წვდომა მხოლოდ ავტორიზებული მოკლევადიანი Signed URL-ით ან Firebase Storage Rules-ით (`request.auth != null` + როლის/ქეისის წვდომის შემოწმება).
- არასდროს შეინახოთ Backblaze B2 ან S3 Application Key ფრონტენდში (`VITE_*`). გამოიყენეთ სერვერული პროქსი/Cloud Function.
