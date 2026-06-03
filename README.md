# HomeBase 🏠

**Live app:** https://jburgh.github.io/homebase/

HomeBase is a sleek, self-contained, mobile-first **Single Page Application (SPA)** designed as a personal home improvement and property maintenance tracker. It allows homeowners to organize living spaces by breaking tasks down by physical rooms (Areas), linking them to larger initiatives (Projects), and managing itemized shopping lists (Supplies & Materials) with real-time financial tracking.

---

## 🚀 Architecture & Technical Stack

The system is built as a lightweight frontend architecture backed by a robust serverless infrastructure:

*   **Frontend Paradigm:** Single Page Application (SPA) utilizing vanilla JavaScript modules (`ESM`), HTML5, and native CSS3 custom properties. It manages screen transitions, modular view routing, and dynamic DOM rendering without heavy structural frameworks.
*   **Database & Backend:** Powered entirely by **Firebase (v10.14+)**. It leverages **Firebase Auth** for local user persistence and session tracking, and **Cloud Firestore** as a real-time, NoSQL database.
*   **State Management:** Governed by a centralized, reactive global state object (`state.js`). Data views are kept synchronized across the application via active listener arrays (`onSnapshot`) tied to granular Firestore query subscriptions.
*   **Security Guardrails:** Strictly enforced through Firestore Security Rules managed in the Firebase Console. House documents are protected by an `ownerId` field matched against the authenticated user's UID. Sub-collection documents (areas, tasks, projects, supplies) are verified via a cross-document `get()` lookup against the parent house record.

---

## ✨ Key Features & Workflow Modules

### 1. Smart Task Optimization & Priority Scoring
Tasks are scored mathematically from 0 to 100 based on a combination of priority tier, user technical ability (effort), and budget. This generates a priority rank to display high-impact tasks automatically on the home dashboard:
$$	ext{Priority Score} = 	ext{Priority Points (0-40)} + 	ext{Effort Points (0-30)} + 	ext{Cost Points (0-30)}$$

*   **Priority:** Critical (40), High (30), Medium (20), Low (10)
*   **Effort:** Novice (30), Apprentice (20), Expert (10), Pro (0)
*   **Cost Tier:** Free (30), $ (20), $$ (10), $$$ (0)

### 2. Itemized Material & Supply Tracking
Users can manage supply items right inside individual tasks. This module features an automated metadata parser powered by the **Microlink API**, which automatically pulls product names and images when a user pastes an e-commerce retailer URL (such as Amazon, Home Depot, or Lowe's). It also includes a localized HTML5 Canvas image resizer to optimize manual photo uploads under 200x200px before uploading.

### 3. Intelligent Project Synchronization
The database implicitly rolls up metrics from individual tasks to calculate overall project costs and progress. Additionally, completing all sub-tasks in a project automatically shifts the project's status to "Complete," and starting an "Open" task automatically bumps a "Planning" project up to "In Progress".

### 4. Interactive Drag-and-Drop Reordering
Integrates the `SortableJS` module via CDN to provide smooth drag-and-drop mechanics. Reordering projects or tasks triggers batch asynchronous database updates to update numerical sorting indicators (`sortOrder`) in Firestore.

### 5. Tabbed Dashboard
The home dashboard organizes content into **Projects** and **Tasks** tabs to reduce vertical scrolling. The Projects tab includes a stats bar (In Progress / Planning / Complete counts) and a configurable list of open projects with a 5 / 10 / All limit control — preference persisted to `localStorage`. The Tasks tab mirrors this pattern for open tasks. Both tabs support drag-and-drop reordering with sort order persisted to Firestore.

### 6. UI Experience & Design System
The design system (`style.css`) is written entirely in native CSS using a mobile-first philosophy:
*   **Theme Control:** Supports immediate toggling between a default light scheme and an optimized dark theme, saving preferences to `localStorage`.
*   **Component Badges:** Built-in semantic component definitions to color-code task types, statuses, and costs.
*   **Typography:** Custom branding accents utilize the stylized Google Font family `Bungee Spice`, applied to the app logo in the header, sidebar, and login screen. The favicon is generated dynamically on a canvas element using the same font after load.

---

## 🛠️ Installation & Local Setup

### Prerequisites
*   A Firebase project created in the [Firebase Console](https://console.firebase.google.com).
*   A local web server to host the static files (e.g., Live Server extension for VS Code, Python's HTTP server, or `http-server` via npm).

### Setup Instructions

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/jburgh/homebase.git
    cd homebase
    ```

2.  **Configure Environment Values:**
    Copy the example configuration file to create your active configuration:
    ```bash
    cp firebase-config.example.js firebase-config.js
    ```
    Open `firebase-config.js` and populate the object with your project credentials found under **Project Settings -> Your Apps** in the Firebase Console:
    ```javascript
    export const firebaseConfig = {
      apiKey: "YOUR_API_KEY",
      authDomain: "YOUR_PROJECT.firebaseapp.com",
      projectId: "YOUR_PROJECT",
      storageBucket: "YOUR_PROJECT.firebasestorage.app",
      messagingSenderId: "YOUR_SENDER_ID",
      appId: "YOUR_APP_ID"
    };
    ```

3.  **Configure Firestore Security Rules:**
    In the [Firebase Console](https://console.firebase.google.com), navigate to **Firestore Database → Rules** and ensure rules restrict access so that users can only read and write their own data. The Console retains full version history for rules changes.

4.  **Run Locally:**
    Launch a local static server from the project root. If you have Python 3:
    ```bash
    python3 -m http.server 8080
    ```
    Or without Python, using `npx`:
    ```bash
    npx serve .
    ```
    Then open `http://localhost:8080` (Python) or the URL shown in the terminal (npx serve) in your browser.

    > **Note:** Sign-in requires `localhost` to be listed under **Firebase Console → Authentication → Settings → Authorized domains**, and your API key must allow `http://localhost/*` as an authorized HTTP referrer in **Google Cloud Console → APIs & Services → Credentials**.

---

## 📦 CI/CD Deployment

The codebase includes an automated deployment pipeline managed through **GitHub Actions** (`.github/workflows/deploy.yml`). 

Upon pushing code changes to the `main` branch, the workflow:
1. Triggers an environment runner on `ubuntu-latest`.
2. Generates the live `firebase-config.js` configuration on the fly using encrypted **GitHub Repository Secrets**.
3. Bundles the verified source repository.
4. Deploys the static assets directly to **GitHub Pages**.
