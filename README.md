# megaweave

## Description

This project aims to transform "MEGAWEAVING", a resource-sharing initiative that originated as a Facebook group, into a searchable, database-driven online platform. The platform connects individuals and communities globally, facilitating transparent circulation and usage of resources. It supports the free exchange of various resources to establish an inclusive infrastructure for resource mutual aid and sharing, promoting environmental sustainability and social equity, especially for those unable to obtain basic resources due to economic conditions.

## Features and Functionality

-   **Resource Sharing Platform:** Connects individuals and communities for sharing idle or free resources.
-   **Searchable Database:** Allows users to search for specific resources based on category, location, and keywords.
-   **User Authentication:** Supports native, Google, and Facebook login.  Uses cookie-based sessions for managing user authentication.
-   **User Profiles:** Enables users to create and manage their profiles, including contact information and a bio.  Contributors can add a title, location, website, and update member name.
-   **Post Creation:** Allows authenticated users to create new posts with images, titles, descriptions, categories, and condition levels.
-   **Image Gallery:** Displays images associated with posts in a gallery format, including a full-screen modal.
-   **Commenting System:** Users can comment on posts, fostering community interaction.
-   **Like/Interest Functionality:** Allows users to express interest in posts.
-   **Contact Information:** Displays the contact information of the post creator.
-   **Location-Based Search:** Allows users to search for resources within a specific location.
-   **Admin and Contributor Roles:** Supports different user roles with varying permissions.
-   **API Rate Limiting**: Implemented to protect the server with `express-rate-limit`
-   **Profile Editing**: Users can edit member information, bio, contact info, etc.

## Technology Stack

-   **Frontend:**
    -   React
    -   Next.js (v14)
    -   TypeScript
    -   Tailwind CSS
    -   Radix UI
    -   Framer Motion
    -   Lucide React (icons)
    -   @react-oauth/google (Google OAuth)
    -   Simple Icons (social media icons)
-   **Backend:**
    -   Node.js
    -   Express
    -   MySQL2
    -   Zod (validation)
    -   dotenv (environment variables)
    -   express-rate-limit
-   **Authentication:**
    -   Cookies
    -   Google OAuth
    -   Facebook Login
-   **Database:**
    -   MySQL
-   **Image Storage:**
    -   AWS S3
-   **Caching:**
    -   Redis
-   **Advertising:**
    - Google Adsense

## Prerequisites

Before you begin, ensure you have met the following requirements:

-   Node.js (v18 or later) and npm installed.
-   MySQL database set up.
-   AWS S3 bucket configured for image storage.
-   Redis server installed and configured.
-   Google OAuth client ID.
-   Facebook App ID.

## Installation Instructions

1.  Clone the repository:

    ```bash
    git clone https://github.com/jgh0604043/megaweave.git
    cd megaweave
    ```

2.  Install server-side dependencies:

    ```bash
    cd server
    npm install
    ```

3.  Install client-side dependencies:

    ```bash
    cd client
    npm install
    ```

4.  Configure environment variables:

    -   Create a `.env.development` file in both `server` and `client` directories.
    -   Add the following variables with appropriate values:

        **Server (.env.development):**

        ```
        DB_HOST=<your_db_host>
        DB_USER=<your_db_user>
        DB_PASSWORD=<your_db_password>
        DB_DATABASE=<your_db_database>
        DB_PORT=<your_db_port>
        COOKIE_SESSION_KEY=<your_cookie_session_key>
        REDIS_SESSION_KEY=<your_redis_session_key>
        REDIS_URL=<your_redis_url>
        GOOGLE_CLIENT_ID=<your_google_client_id>
        FACEBOOK_APP_ID=<your_facebook_app_id>
        BUCKET_NAME=<your_aws_s3_bucket_name>
        BUCKET_REGION=<your_aws_s3_bucket_region>
        ACCESS_KEY=<your_aws_access_key>
        SECRET_ACCESS_KEY=<your_aws_secret_access_key>
        CERT_PATH=<path_to_your_ssl_cert> (e.g., ./ssl/cert.pem)
        KEY_PATH=<path_to_your_ssl_key> (e.g., ./ssl/key.pem)
        PASSPHRASE=<ssl_cert_passphrase>
        UPLOAD_IMAGE_LIMIT=5
        CLOUDFRONT_URL=<your_cloudfront_url>
        S3_BUCKET_IMAGE_FOLDER=posts
        S3_BUCKET_AVATAR_FOLDER=avatars
        ENABLE_HTTPS=false (set to true for local HTTPS development )
        NODE_ENV=development
        ```

        **Client (.env.development):**

        ```
        NEXT_PUBLIC_HOSTNAME=http://localhost:8443 (or your deployed hostname)
        NEXT_PUBLIC_GOOGLE_CLIENT_ID=<your_google_client_id>
        NEXT_PUBLIC_FACEBOOK_APP_ID=<your_facebook_app_id>
        NEXT_PUBLIC_ADSENSE_PUBLISHER_ID=<your_adsense_publisher_id>
        NEXT_PUBLIC_USERNAME_MAX_LENGTH=30
        ```

5.  Set up the MySQL database:

    -   Create a database named as specified in your `.env.development` file.
    -   Import the database schema (not provided in the file set, requires separate setup).  The project expects tables such as `users`, `user_profiles`, `posts`, `categories`, `conditions`, and `images`.

## Usage Guide

1.  Start the Redis server:

    ```bash
    redis-server
    ```

2.  Start the server:

    ```bash
    cd server
    npm run dev
    ```

3.  Start the client:

    ```bash
    cd client
    npm run dev
    ```

4.  Open your browser and navigate to `http://localhost:3000` (or your configured hostname).

5.  Create a user account or sign in using Google or Facebook.

6.  Start sharing and discovering resources!

## API Documentation

The server exposes the following API endpoints:

-   `POST /api/signup`: Registers a new user.
-   `POST /api/signin`: Signs in an existing user.
    -   `POST /api/signin/google`: Signs in a user with Google OAuth.
    -   `POST /api/signin/facebook`: Signs in a user with Facebook.
-   `GET /api/currentUser`: Retrieves the current user's information (requires authentication).
-   `POST /api/signout`: Signs out the current user.
-   `GET /api/posts`: Retrieves a list of posts with pagination and filtering options (category, location, search).
-   `GET /api/posts/:id`: Retrieves details for a specific post.
-   `POST /api/posts`: Creates a new post (requires authentication).  Expects `multipart/form-data` for image uploads.
-   `GET /api/categories`: Retrieves a list of categories.
-   `GET /api/conditions`: Retrieves a list of condition levels.
-   `POST /api/avatar`: Uploads a user avatar (requires authentication, contributor role).
-   `GET /api/userprofile/bio`: Get user profile bio.
-   `POST /api/userprofile/bio`: Create or Update user profile bio.
-   `GET /api/userprofile/custom_name`: Get user profile custom name.
-   `POST /api/userprofile/custom_name`: Create or Update user profile custom name.
-   `GET /api/member/all`: Get list of Team Members to render in About page
-   `POST /api/member`: (Contributor/Admin Role Required) Insert member data to database.

## Contributing Guidelines

1.  Fork the repository.
2.  Create a new branch for your feature or bug fix.
3.  Implement your changes, ensuring code quality and proper testing.
4.  Commit your changes with descriptive messages.
5.  Push your branch to your forked repository.
6.  Submit a pull request to the `main` branch of the original repository.

## License Information

This project has no specified license.  All rights are reserved.

## Contact/Support Information

For any inquiries or support, please contact: jgh0604043@gmail.com