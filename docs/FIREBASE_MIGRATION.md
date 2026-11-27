# Firebase deployment

აპლიკაციის production source-of-truth არის Firebase:

- Firebase Authentication — Email/Password ანგარიშები;
- Cloud Firestore — ყველა სტრუქტურირებული მონაცემი და live sync;
- Firebase Storage — ატვირთული ფაილები;
- Dexie/IndexedDB — მხოლოდ სწრაფი ოფლაინ cache.

## Firebase Console-ის ერთჯერადი მომზადება

1. Authentication → Sign-in method-ში ჩართეთ **Email/Password**.
2. შექმენით Firestore Database და Storage bucket.
3. რეპოზიტორიის root-დან გაუშვით:

```bash
npm install
npm run build
npx firebase-tools login
npx firebase-tools deploy --project docrama-1a7b9
```

ბრძანება განათავსებს Hosting build-ს, `firestore.rules`, ინდექსებსა და `storage.rules`-ს.

## პირველი ადმინისტრატორი

პირველ გაშვებაზე შედით `imedo` / `imed458` მონაცემებით. თუ ანგარიში ჯერ არ არსებობს, აპლიკაცია შექმნის Firebase Auth მომხმარებელსა და `users/{uid}` admin პროფილს. პირველივე შესვლის შემდეგ შეცვალეთ საწყისი პაროლი.

## სინქრონიზაცია

ყველა repository mutation ჯერ სრულდება ადგილობრივ cache-ში და შემდეგ, ოპერაციის წარმატებულად დასრულებამდე, Firestore batch-ში ინახება. Firestore snapshot listeners სხვა მომხმარებლებისა და მოწყობილობების ცვლილებებს რეალურ დროში აბრუნებს UI-ში. ქეისის ნომერი გამოიყოფა Firestore transaction-ით, რათა პარალელურ მომხმარებლებს ერთნაირი ნომერი არ მიენიჭოთ.
