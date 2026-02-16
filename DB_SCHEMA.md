# Database Schema
The following is a rough database schema sketch for what tables to create and maintain for the DermAtlas application.

### Users
Intended to store general user information for authentication and role-based-access. Generally includes both patients and physicians.

Column Name | Data Type | Constraints | Description
|---|---|---|---|
user_id|SERIAL|PRIMARY KEY|Unique identifier for the user.
email|VARCHAR(255)|UNIQUE| NOT NULL|User's email address (login credential).
password_hash|VARCHAR(255)|NOT NULL|Hashed password (never store plain text).
full_name|VARCHAR(100)|-|Full legal name of the user.
role|VARCHAR(10)|NOT NULL|Enum: [PCP| PATIENT]
npi_number|VARCHAR(20)|-|National Provider Identifier (for physicians only).
created_at|TIMESTAMP|DEFAULT NOW()|Account creation timestamp.

### Patients
Stores the demographic data for associated patient users. Access is restricted based on assigned physician.

Column Name|Data Type|Constraints|Description
|---|---|---|---|
patient_id|SERIAL|PRIMARY KEY|Unique identifier for the patient.
primary_physician_id|INTEGER|Foreign Key -> users(user_id)|The PCP responsible for this patient.
mrn_internal|VARCHAR(50)|UNIQUE|Internal Medical Record Number (hospital ID).
date_of_birth|DATE|-|Patient's DOB for age-based analytics.
gender|VARCHAR(5)|-|Enum: [male| female]
created_at|TIMESTAMP|DEFAULT NOW()|Record creation timestamp.

### Reference_Atlas [Existing Diagnosis]
Holds metadata for the ISIC/HAM10000 images for vector storage and search.

Column Name|Data Type|Constraints|Description
|---|---|---|---|
reference_id|SERIAL|PRIMARY KEY|Unique ID for the reference image.
gcs_image_uri|VARCHAR(500)|NOT NULL|Path to the image file in Google Cloud Storage.
vertex_vector_id|VARCHAR(255)|NOT NULL|The ID linking this row to the Vector Search index.
diagnosis_label|VARCHAR(100)|NOT NULL|Ground truth label (e.g.| 'Melanoma'| 'Nevus').
diagnosis_type|VARCHAR(50)|-|Broad category (e.g.| 'Benign'| 'Malignant').
modality|VARCHAR(50)|-|Image type (e.g.| 'Dermoscopic'| 'Clinical').
body_part|VARCHAR(100)|-|Anatomic site of the lesion.
source_dataset|VARCHAR(50)|-|Origin (e.g.| 'ISIC_2019'| 'HAM10000').

### Clinical_Images
Holds metadata for the uploaded images of patient lesions by the primary care physician.

Column Name|Data Type|Constraints|Description
|---|---|---|---|
query_id|SERIAL|PRIMARY KEY|Unique ID for the query event.
user_id|INTEGER|Foreign Key -> users(user_id)|The doctor who uploaded the image.
patient_id|INTEGER|Foreign Key -> patients(patient_id)|The patient the image belongs to.
gcs_image_uri|VARCHAR(500)|NOT NULL|Path to the uploaded image in Cloud Storage.
vertex_vector_id|VARCHAR(255)|-|The generated embedding ID for this new image.
lesion_location|VARCHAR(100)|-|Body part where the lesion is located.
clinician_notes|TEXT|-|Optional notes added by the doctor.
captured_at|TIMESTAMP|DEFAULT NOW()|Timestamp of the upload.

### Recommendation_Feedback
Tracking for feedback given by primary care physicians for the re-ranking layer. Tracks which reference images were deemed useful or not.

Column Name|Data Type|Constraints|Description
|---|---|---|---|
feedback_id|SERIAL|PRIMARY KEY|Unique ID for the feedback action.
query_id|INTEGER|Foreign Key -> clinical_queries|The specific query session.
reference_id|INTEGER|Foreign Key -> reference_atlas|The historical case being voted on.
user_id|INTEGER|Foreign Key -> users(user_id)|The doctor submitting the feedback.
is_helpful|BOOLEAN|NOT NULL|True = Helpful| False = Not Helpful.
feedback_timestamp|TIMESTAMP|DEFAULT NOW()|Time the feedback was given.

### Audit_Logs
Tracks who viewed what and when for HIPAA compliance and security.

Column Name|Data Type|Constraints|Description
|---|---|---|---|
log_id|BIGSERIAL|PRIMARY KEY|Unique ID for the log entry.
user_id|INTEGER|Foreign Key -> users(user_id)|The user performing the action.
action|VARCHAR(50)|NOT NULL|The action type (e.g.| 'VIEW_PATIENT'| 'UPLOAD').
target_resource|VARCHAR(100)|-|ID of the data accessed (e.g.| 'patient_id: 102').s
timestamp|TIMESTAMP|DEFAULT NOW()|Exact time of the event.
