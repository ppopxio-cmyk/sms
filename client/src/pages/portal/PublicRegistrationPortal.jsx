import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  User,
  GraduationCap,
  Calendar,
  Phone,
  Mail,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Video,
  FileText,
  Printer,
  Loader2,
  X,
  Upload,
  Camera,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Building2,
  BookOpen,
  Award,
  FileCheck,
  Copy,
  Clock,
  IdCard,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import Brand from '../../components/ui/Brand';
import { ETH_MONTHS, fromEthiopian, formatEthiopian } from '../../lib/ethiopianDate';

const ETHIOPIAN_REGIONS = [
  { id: 'Addis Ababa', en: 'Addis Ababa', am: 'አዲስ አበባ' },
  { id: 'Afar', en: 'Afar', am: 'አፋር' },
  { id: 'Amhara', en: 'Amhara', am: 'አማራ' },
  { id: 'Benishangul-Gumuz', en: 'Benishangul-Gumuz', am: 'ቤኒሻንጉል ጉሙዝ' },
  { id: 'Central Ethiopia', en: 'Central Ethiopia', am: 'ማዕከላዊ ኢትዮጵያ' },
  { id: 'Dire Dawa', en: 'Dire Dawa', am: 'ድሬዳዋ' },
  { id: 'Gambela', en: 'Gambela', am: 'ጋምቤላ' },
  { id: 'Harari', en: 'Harari', am: 'ሐረሪ' },
  { id: 'Oromia', en: 'Oromia', am: 'ኦሮሚያ' },
  { id: 'Sidama', en: 'Sidama', am: 'ሲዳማ' },
  { id: 'Somali', en: 'Somali', am: 'ሶማሌ' },
  { id: 'South Ethiopia', en: 'South Ethiopia', am: 'ደቡብ ኢትዮጵያ' },
  { id: 'South West Ethiopia', en: 'South West Ethiopia', am: 'ደቡብ ምዕራብ ኢትዮጵያ' },
  { id: 'Tigray', en: 'Tigray', am: 'ትግራይ' },
];

function getYouTubeEmbedUrl(url) {
  if (!url) return '';
  try {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return match && match[2].length === 11
      ? `https://www.youtube-nocookie.com/embed/${match[2]}`
      : url;
  } catch {
    return url;
  }
}

// Name validator: letters, Ge'ez/Amharic unicode, spaces, hyphens only
function isValidName(val) {
  if (!val) return false;
  return /^[a-zA-Z\u1200-\u137F\s\-']+$/.test(val.trim());
}

export default function PublicRegistrationPortal() {
  const { portalId } = useParams();

  const [loading, setLoading] = useState(true);
  const [portal, setPortal] = useState(null);
  const [notFound, setNotFound] = useState(false);

  // Stepper State (Step 1, 2, or 3)
  const [currentStep, setCurrentStep] = useState(1);
  const [validatingStep1, setValidatingStep1] = useState(false);

  // Video Tutorial Modal
  const [showVideoModal, setShowVideoModal] = useState(false);

  // Step 1: Personal Information & Contact
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gender, setGender] = useState('female');

  // Ethiopian Birth Date
  const [birthYear, setBirthYear] = useState('2000');
  const [birthMonth, setBirthMonth] = useState('1');
  const [birthDay, setBirthDay] = useState('1');

  // Contact & Location
  const [email, setEmail] = useState('');
  const [phoneDigits, setPhoneDigits] = useState(''); // 9 digits starting with 9 or 7
  const [region, setRegion] = useState('');
  const [city, setCity] = useState('');
  const [woreda, setWoreda] = useState('');
  const [line, setLine] = useState('');

  // Student Photo (Max 5MB)
  const [photoUrl, setPhotoUrl] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Applicant National ID (Front & Back, Max 5MB each)
  const [applicantIdFront, setApplicantIdFront] = useState('');
  const [applicantIdBack, setApplicantIdBack] = useState('');
  const [uploadingApplicantNidFront, setUploadingApplicantNidFront] = useState(false);
  const [uploadingApplicantNidBack, setUploadingApplicantNidBack] = useState(false);

  // Step 2: Emergency Contact & Academic Background
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhoneDigits, setEmergencyPhoneDigits] = useState(''); // 9 digits starting with 9 or 7
  const [emergencyRel, setEmergencyRel] = useState('');
  const [emergencyIdFront, setEmergencyIdFront] = useState('');
  const [emergencyIdBack, setEmergencyIdBack] = useState('');
  const [uploadingEmgNidFront, setUploadingEmgNidFront] = useState(false);
  const [uploadingEmgNidBack, setUploadingEmgNidBack] = useState(false);

  const [schoolName, setSchoolName] = useState('');
  const [completionYear, setCompletionYear] = useState('');

  // Step 3: Programme Selection & 12th Grade Document
  const [qualificationType, setQualificationType] = useState('degree');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedProgram, setSelectedProgram] = useState('');
  const [certificateDoc, setCertificateDoc] = useState(null); // { fileName, fileType, fileSize, dataUrl }
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // Submitting & Result
  const [submitting, setSubmitting] = useState(false);
  const [applicationResult, setApplicationResult] = useState(null);

  useEffect(() => {
    async function loadPortal() {
      setLoading(true);
      setNotFound(false);
      try {
        const res = await fetch(`/api/public/registration-portals/${portalId}`);
        if (!res.ok) {
          setNotFound(true);
          return;
        }
        const data = await res.json();
        setPortal(data.portal);

        // Auto-open video tutorial if video URL exists
        if (data.portal?.tutorialVideoUrl) {
          setShowVideoModal(true);
        }

        // Auto-select initial department/program if available
        if (data.portal?.departments?.length > 0) {
          const initDeptId = data.portal.departments[0]._id || data.portal.departments[0].id || '';
          setSelectedDepartment(initDeptId);

          // Find first program for this department
          const deptPrograms = (data.portal.programs || []).filter(
            (p) => !p.department || p.department === initDeptId || p.department?._id === initDeptId
          );
          if (deptPrograms.length > 0) {
            setSelectedProgram(deptPrograms[0]._id || deptPrograms[0].id || '');
            if (deptPrograms[0].qualificationType) {
              setQualificationType(deptPrograms[0].qualificationType);
            }
          }
        } else if (data.portal?.programs?.length > 0) {
          setSelectedProgram(data.portal.programs[0]._id || data.portal.programs[0].id || '');
          if (data.portal.programs[0].qualificationType) {
            setQualificationType(data.portal.programs[0].qualificationType);
          }
        }
      } catch (err) {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }
    if (portalId) {
      loadPortal();
    }
  }, [portalId]);

  // Dynamic available programs filtered by selected department and qualification type
  const availablePrograms = useMemo(() => {
    if (!portal || !portal.programs) return [];
    return portal.programs.filter((p) => {
      // Check department match if a department is selected
      if (selectedDepartment) {
        const pDeptId = p.department?._id || p.department;
        if (pDeptId && String(pDeptId) !== String(selectedDepartment)) {
          return false;
        }
      }
      // Check qualification match
      if (p.qualificationType && qualificationType) {
        return p.qualificationType.toLowerCase() === qualificationType.toLowerCase();
      }
      return true;
    });
  }, [portal, selectedDepartment, qualificationType]);

  // When selected department or qualification type changes, auto-select a valid program if needed
  useEffect(() => {
    if (availablePrograms.length > 0) {
      const currentValid = availablePrograms.some(
        (p) => String(p._id || p.id) === String(selectedProgram)
      );
      if (!currentValid) {
        setSelectedProgram(availablePrograms[0]._id || availablePrograms[0].id || '');
      }
    } else {
      setSelectedProgram('');
    }
  }, [availablePrograms, selectedProgram]);

  // Helper for single image file reading
  const handleImageUpload = (file, onSuccess, setUploading) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file (JPG, PNG, WEBP). / እባክዎ ምስል ፋይል ይምረጡ።');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size must be under 5MB. / የምስሉ መጠን ከ5MB በታች መሆን አለበት።');
      return;
    }

    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = (e) => {
        onSuccess(e.target.result);
        setUploading(false);
      };
      reader.onerror = () => {
        toast.error('Failed to read image file. / ምስሉን ማንበብ አልተቻለም።');
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch {
      toast.error('Error reading image file.');
      setUploading(false);
    }
  };

  // Handle Photo Select
  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0];
    handleImageUpload(
      file,
      (url) => {
        setPhotoUrl(url);
        toast.success('Student photo attached. / የተማሪ ፎቶ ተያይዟል።');
      },
      setUploadingPhoto
    );
  };

  // Handle 12th Grade Result Certificate Document (PDF or Word, max 15MB)
  const handleDocSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isDoc =
      file.type === 'application/pdf' ||
      file.type === 'application/msword' ||
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      /\.(pdf|doc|docx)$/i.test(file.name);

    if (!isDoc) {
      toast.error('Only PDF and Word documents (.pdf, .doc, .docx) are accepted. / PDF ወይም Word ሰነዶች ብቻ ይቀበላሉ።');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      toast.error('Document size must be under 15MB. / የሰነድ መጠን ከ15MB በታች መሆን አለበት።');
      return;
    }

    setUploadingDoc(true);
    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        setCertificateDoc({
          fileName: file.name,
          fileType: file.type || 'application/pdf',
          fileSize: file.size,
          dataUrl: event.target.result,
        });
        setUploadingDoc(false);
        toast.success(`Attached ${file.name}`);
      };
      reader.onerror = () => {
        toast.error('Failed to read document file.');
        setUploadingDoc(false);
      };
      reader.readAsDataURL(file);
    } catch {
      toast.error('Error reading document file.');
      setUploadingDoc(false);
    }
  };

  // Step 1 Validation & Proceed
  const handleProceedToStep2 = async () => {
    // 1. Name validation
    if (!firstName.trim() || !middleName.trim() || !lastName.trim()) {
      toast.error('First, middle, and grandfather names are all required. / የመጀመሪያ፣ የአባት እና የአያት ስም ሙሉ በሙሉ ያስፈልጋሉ።');
      return;
    }
    if (!isValidName(firstName) || !isValidName(middleName) || !isValidName(lastName)) {
      toast.error('Names must contain letters only, without special characters or numbers. / ስሞች ፊደላትን ብቻ መያዝ አለባቸው።');
      return;
    }

    // 2. Email validation
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !/^[\w.%+-]+@gmail\.com$/i.test(cleanEmail)) {
      toast.error('A valid Google Gmail address (@gmail.com) is required. / ትክክለኛ የጂሜይል (@gmail.com) አድራሻ ያስፈልጋል።');
      return;
    }

    // 3. Phone validation: locked +251, starts with 9 or 7, exactly 9 digits
    const cleanDigits = phoneDigits.replace(/\D/g, '');
    if (!cleanDigits || cleanDigits.length !== 9 || (!cleanDigits.startsWith('9') && !cleanDigits.startsWith('7'))) {
      toast.error('Phone number must start with 9 or 7 and contain exactly 9 digits (e.g. 912345678). / ስልክ ቁጥር በ9 ወይም 7 መጀመር እና 9 አሃዞች መሆን አለበት።');
      return;
    }
    const fullPhone = `+251${cleanDigits}`;

    // 4. Region, City, Woreda, Line (All required)
    if (!region) {
      toast.error('Please select an Ethiopian region. / እባክዎ ክልል ይምረጡ።');
      return;
    }
    if (!city.trim() || !woreda.trim() || !line.trim()) {
      toast.error('City, Woreda, and House/Street address are all required. / ከተማ፣ ወረዳ እና የቤት/መንገድ አድራሻ ያስፈልጋሉ።');
      return;
    }

    // 5. Photos: Student photo, Applicant National ID Front & Back
    if (!photoUrl) {
      toast.error('Student profile photo is required. / የተማሪው ፎቶ ያስፈልጋል።');
      return;
    }
    if (!applicantIdFront) {
      toast.error('Applicant National ID / Passport (Front side) is required. / የተማሪው መታወቂያ (የፊት ገጽ) ያስፈልጋል።');
      return;
    }
    if (!applicantIdBack) {
      toast.error('Applicant National ID / Passport (Back side) is required. / የተማሪው መታወቂያ (የኋላ ገጽ) ያስፈልጋል።');
      return;
    }

    // 6. Server-Side Pre-validation (Uniqueness of email, phone, and pending name check)
    setValidatingStep1(true);
    try {
      const res = await fetch(`/api/public/registration-portals/${portalId}/prevalidate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'sms-web',
        },
        body: JSON.stringify({
          firstName: firstName.trim(),
          middleName: middleName.trim(),
          lastName: lastName.trim(),
          email: cleanEmail,
          phone: fullPhone,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || 'Validation failed. Please review your details.');
        return;
      }

      // Step 1 Passed! Proceed to Step 2
      setCurrentStep(2);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      toast.error('Could not verify applicant details. Please check your network and try again.');
    } finally {
      setValidatingStep1(false);
    }
  };

  // Step 2 Validation & Proceed
  const handleProceedToStep3 = () => {
    // 1. Emergency Contact Name & Relationship
    if (!emergencyName.trim()) {
      toast.error('Emergency contact person name is required. / የአስቸኳይ ጊዜ ተጠሪ ስም ያስፈልጋል።');
      return;
    }
    if (!isValidName(emergencyName)) {
      toast.error('Emergency contact name must contain letters only. / የተጠሪ ስም ፊደላትን ብቻ መያዝ አለበት።');
      return;
    }
    if (!emergencyRel.trim()) {
      toast.error('Relationship to emergency contact is required. / ከተጠሪው ጋር ያለው ዝምድና ያስፈልጋል።');
      return;
    }

    // 2. Emergency Contact Phone: locked +251, starts with 9 or 7, exactly 9 digits
    const cleanEmgDigits = emergencyPhoneDigits.replace(/\D/g, '');
    if (!cleanEmgDigits || cleanEmgDigits.length !== 9 || (!cleanEmgDigits.startsWith('9') && !cleanEmgDigits.startsWith('7'))) {
      toast.error('Emergency phone must start with 9 or 7 and contain exactly 9 digits (e.g. 912345678). / የተጠሪ ስልክ በ9 ወይም 7 መጀመር እና 9 አሃዞች መሆን አለበት።');
      return;
    }

    // 3. Emergency Contact National ID Front & Back
    if (!emergencyIdFront) {
      toast.error('Emergency contact National ID (Front side) is required. / የተጠሪው መታወቂያ (የፊት ገጽ) ያስፈልጋል።');
      return;
    }
    if (!emergencyIdBack) {
      toast.error('Emergency contact National ID (Back side) is required. / የተጠሪው መታወቂያ (የኋላ ገጽ) ያስፈልጋል።');
      return;
    }

    // 4. Academic Background
    if (!schoolName.trim()) {
      toast.error('Previous school or college name is required. / የቀድሞ ትምህርት ቤት ስም ያስፈልጋል።');
      return;
    }
    const cleanYear = completionYear.replace(/\D/g, '');
    if (!cleanYear || cleanYear.length !== 4) {
      toast.error('Completion year must be a 4-digit Ethiopian calendar year (e.g. 2016). / የተመረቀበት ዓመት 4 አሃዝ መሆን አለበት (ምሳሌ፡ 2016)።');
      return;
    }

    setCurrentStep(3);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Step 3 Final Submit
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!certificateDoc) {
      toast.error('Please upload your 12th grade result certification document (PDF or Word, max 15MB). / እባክዎ የ12ኛ ክፍል ውጤት ሰነድ ይጫኑ።');
      return;
    }

    if (!selectedProgram) {
      toast.error('Please select a programme of study. / እባክዎ ፕሮግራም ይምረጡ።');
      return;
    }

    setSubmitting(true);
    try {
      const fullPhone = `+251${phoneDigits.replace(/\D/g, '')}`;
      const fullEmergencyPhone = `+251${emergencyPhoneDigits.replace(/\D/g, '')}`;

      const res = await fetch(`/api/public/registration-portals/${portalId}/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'sms-web',
        },
        body: JSON.stringify({
          firstName: firstName.trim(),
          middleName: middleName.trim(),
          lastName: lastName.trim(),
          gender,
          birthYear: Number(birthYear),
          birthMonth: Number(birthMonth),
          birthDay: Number(birthDay),
          email: email.trim().toLowerCase(),
          phone: fullPhone,
          address: {
            region: region.trim(),
            city: city.trim(),
            woreda: woreda.trim(),
            line: line.trim(),
          },
          emergencyContact: {
            name: emergencyName.trim(),
            phone: fullEmergencyPhone,
            relationship: emergencyRel.trim(),
            nationalIdFront: { url: emergencyIdFront },
            nationalIdBack: { url: emergencyIdBack },
          },
          nationalIdFront: { url: applicantIdFront },
          nationalIdBack: { url: applicantIdBack },
          previousEducation: {
            schoolName: schoolName.trim(),
            completionYear: completionYear.trim(),
          },
          photo: {
            url: photoUrl || null,
            status: photoUrl ? 'active' : 'missing',
          },
          qualificationType,
          departmentId: selectedDepartment || portal.departments?.[0]?._id || portal.department,
          programId: selectedProgram || portal.programs?.[0]?._id || portal.program,
          certificateDocument: certificateDoc
            ? {
                fileName: certificateDoc.fileName,
                fileType: certificateDoc.fileType,
                fileSize: certificateDoc.fileSize,
                url: certificateDoc.dataUrl,
              }
            : null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || 'Could not submit application.');
        return;
      }

      setApplicationResult(data.application);
      toast.success('Application submitted successfully! / ማመልከቻዎ በተሳካ ሁኔታ ገብቷል!');
    } catch (err) {
      toast.error('Network error or file size limit. Please ensure documents are within limits and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
          <p className="text-sm font-medium text-slate-500">
            Loading registration portal... / የመመዝገቢያ ፖርታል እየተጫነ ነው...
          </p>
        </div>
      </div>
    );
  }

  if (notFound || !portal) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <AlertCircle className="mx-auto h-12 w-12 text-slate-400" />
          <h1 className="mt-4 text-xl font-bold text-slate-800">Registration Portal Not Found / ፖርታሉ አልተገኘም</h1>
          <p className="mt-2 text-sm text-slate-500">
            This admission portal link does not exist, has expired, or is currently closed.
          </p>
          <div className="mt-6">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              Go to College Home / ወደ ዋና ገጽ ሂድ
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Success Confirmation Screen
  if (applicationResult) {
    const trackingRef = applicationResult.applicationNumber;
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 print:bg-white print:p-0">
        <div className="mx-auto max-w-xl">
          <div className="mb-4 flex items-center justify-end print:hidden">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Printer className="h-4 w-4" />
              <span>Print Application Slip / ማመልከቻ አትም</span>
            </button>
          </div>

          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm print:border-none print:shadow-none">
            <div className="border-b border-emerald-100 bg-gradient-to-br from-emerald-600 to-teal-800 p-8 text-center text-white">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 shadow-inner backdrop-blur-sm">
                <CheckCircle2 className="h-10 w-10 text-white" />
              </div>
              <h1 className="mt-4 text-2xl font-black tracking-tight">Application Submitted Successfully!</h1>
              <p className="mt-1 text-sm font-semibold text-emerald-100">ማመልከቻዎ በተሳካ ሁኔታ ደርሶናል!</p>
              <p className="mt-2 text-xs text-emerald-100 max-w-md mx-auto leading-relaxed">
                Your application has been received and is registered in our admissions system. Keep your permanent tracking reference number to monitor your evaluation progress.
              </p>
            </div>

            <div className="p-8 space-y-6">
              {/* Tracking Reference Callout Card */}
              <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50/70 p-5 text-center shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                  Permanent Tracking Reference / የክትትል መለያ ቁጥር
                </p>
                <p className="mt-1.5 font-mono text-3xl font-extrabold text-emerald-950 tracking-wider">
                  {trackingRef}
                </p>
                <div className="mt-3 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(trackingRef);
                      toast.success('Tracking reference copied to clipboard!');
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 shadow-xs hover:bg-emerald-50 transition"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy Reference / ቁጥሩን ገልብጥ</span>
                  </button>
                  <Link
                    to={`/application/track?ref=${encodeURIComponent(trackingRef)}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-800 transition"
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                    <span>Track Online / ሁኔታውን ተከታተል</span>
                  </Link>
                </div>
              </div>

              <div className="space-y-3 divide-y divide-slate-100 text-sm">
                <div className="flex justify-between py-2">
                  <span className="text-slate-500">Applicant Full Name / የተማሪው ሙሉ ስም</span>
                  <span className="font-semibold text-slate-900">{applicationResult.fullName}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-slate-500">Registered Email / ኢሜይል</span>
                  <span className="font-mono text-xs text-slate-800">{applicationResult.email}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-slate-500">Phone Number / ስልክ ቁጥር</span>
                  <span className="font-mono text-xs text-slate-800">{applicationResult.phone}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-slate-500">Initial Status / የመጀመሪያ ሁኔታ</span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800 ring-1 ring-amber-200">
                    <Clock className="h-3 w-3" /> Under Review / በግምገማ ላይ
                  </span>
                </div>
              </div>

              {/* Instructions Card */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 space-y-2">
                <p className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-brand-600" />
                  <span>Important Admissions Guidelines / ጠቃሚ ማሳሰቢያ፡</span>
                </p>
                <p className="leading-relaxed">
                  • An official confirmation email containing your tracking reference has been dispatched to <strong>{applicationResult.email}</strong>.
                </p>
                <p className="leading-relaxed">
                  • The Admissions Office reviews applications within 24 to 48 hours. You can return to the online tracking page anytime to check for approval or document updates.
                </p>
              </div>

              {/* College Social & Contact */}
              <div className="pt-2 text-center text-xs text-slate-500 space-y-2 print:hidden">
                <p className="font-semibold text-slate-700">Need help with your application?</p>
                <p>Contact Admissions Office: haile12michaell@gmail.com · +251 911 000 000</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const embedUrl = getYouTubeEmbedUrl(portal.tutorialVideoUrl);

  // Current qualification minimum entry cutoff points
  const currentCutoff =
    qualificationType === 'degree'
      ? portal.entryPoints?.degree || 350
      : qualificationType === 'diploma'
        ? portal.entryPoints?.diploma || 275
        : portal.entryPoints?.shortTerm || 200;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-2xl">
        {/* Brand & Tutorial Video Button */}
        <div className="mb-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Brand />
          {portal.tutorialVideoUrl && (
            <button
              type="button"
              onClick={() => setShowVideoModal(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-bold text-red-700 shadow-sm hover:bg-red-100 transition"
            >
              <Video className="h-4 w-4 text-red-600" />
              <span>Watch Application Tutorial / አጋዥ ቪዲዮ ይመልከቱ</span>
            </button>
          )}
        </div>

        {/* Portal Info Banner */}
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-gradient-to-r from-brand-600 to-indigo-700 p-6 text-white">
            <span className="inline-block rounded-lg bg-white/20 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider backdrop-blur-sm">
              Online Admission Portal / የመስመር ላይ ምዝገባ
            </span>
            <h1 className="mt-2 text-2xl font-black">{portal.title}</h1>
            <p className="mt-1 text-xs text-brand-100">
              Department of{' '}
              {portal.departments?.length > 1
                ? portal.departments.map((d) => d.name || d.code).join(', ')
                : portal.department || 'All Departments'}{' '}
              •{' '}
              {portal.programs?.length > 1
                ? portal.programs.map((p) => p.name || p.code).join(', ')
                : portal.program || 'All Programmes'}{' '}
              ({String(portal.category || 'regular').toUpperCase()})
            </p>
          </div>

          {/* Stepper Progress Bar */}
          <div className="border-b border-slate-100 bg-slate-50/70 p-4">
            <div className="flex items-center justify-between">
              {[
                { step: 1, labelEn: '1. Personal & Contact', labelAm: '1. የግል እና አድራሻ' },
                { step: 2, labelEn: '2. Academic & Emergency', labelAm: '2. ትምህርት እና ተጠሪ' },
                { step: 3, labelEn: '3. Programme & Certificate', labelAm: '3. ፕሮግራም እና ሰነድ' },
              ].map((item) => (
                <div key={item.step} className="flex items-center gap-2">
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition ${
                      currentStep === item.step
                        ? 'bg-brand-600 text-white shadow-sm'
                        : currentStep > item.step
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {currentStep > item.step ? '✓' : item.step}
                  </div>
                  <div className="hidden sm:flex flex-col">
                    <span
                      className={`text-xs font-semibold ${
                        currentStep === item.step
                          ? 'text-brand-900 font-bold'
                          : currentStep > item.step
                            ? 'text-emerald-700'
                            : 'text-slate-400'
                      }`}
                    >
                      {item.labelEn}
                    </span>
                    <span className="text-[10px] text-slate-400 font-normal">
                      {item.labelAm}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Multi-Step Form */}
          <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6">
            {/* ================= STEP 1: Personal & Contact ================= */}
            {currentStep === 1 && (
              <div className="space-y-6 animate-fade">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
                    <User className="h-4 w-4 text-brand-600" />
                    <span>Personal Information / የግል መረጃ</span>
                  </h2>

                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        First Name / የመጀመሪያ ስም <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Semir"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value.replace(/[^a-zA-Z\u1200-\u137F\s\-']/g, ''))}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Father's Name / የአባት ስም <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Muleta"
                        value={middleName}
                        onChange={(e) => setMiddleName(e.target.value.replace(/[^a-zA-Z\u1200-\u137F\s\-']/g, ''))}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Grandfather's Name / የአያት ስም <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Ahmed"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value.replace(/[^a-zA-Z\u1200-\u137F\s\-']/g, ''))}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Gender / ጾታ <span className="text-rose-500">*</span>
                      </label>
                      <div className="flex items-center gap-4 mt-2">
                        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                          <input
                            type="radio"
                            name="gender"
                            value="female"
                            checked={gender === 'female'}
                            onChange={(e) => setGender(e.target.value)}
                            className="text-brand-600 focus:ring-brand-500"
                          />
                          <span>Female / ሴት</span>
                        </label>
                        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                          <input
                            type="radio"
                            name="gender"
                            value="male"
                            checked={gender === 'male'}
                            onChange={(e) => setGender(e.target.value)}
                            className="text-brand-600 focus:ring-brand-500"
                          />
                          <span>Male / ወንድ</span>
                        </label>
                      </div>
                    </div>

                    {/* Ethiopian Date of Birth */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Date of Birth (E.C.) / የትውልድ ቀን (ዓ.ም) <span className="text-rose-500">*</span>
                      </label>
                      <div className="grid grid-cols-3 gap-2 mt-1">
                        <input
                          type="number"
                          min="1970"
                          max="2015"
                          value={birthYear}
                          onChange={(e) => setBirthYear(e.target.value)}
                          placeholder="Year / ዓመት"
                          className="rounded-xl border border-slate-200 px-2 py-2 text-xs text-center font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                        <select
                          value={birthMonth}
                          onChange={(e) => setBirthMonth(e.target.value)}
                          className="rounded-xl border border-slate-200 px-2 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                        >
                          {ETH_MONTHS.map((name, idx) => (
                            <option key={name} value={idx + 1}>
                              {name}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min="1"
                          max="30"
                          value={birthDay}
                          onChange={(e) => setBirthDay(e.target.value)}
                          placeholder="Day / ቀን"
                          className="rounded-xl border border-slate-200 px-2 py-2 text-xs text-center font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Student Photo Upload (Max 5MB) */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-white">
                      {photoUrl ? (
                        <img src={photoUrl} alt="Student" className="h-full w-full object-cover" />
                      ) : (
                        <Camera className="h-8 w-8 text-slate-300" />
                      )}
                      {uploadingPhoto && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                          <Loader2 className="h-5 w-5 animate-spin text-white" />
                        </div>
                      )}
                    </div>
                    <div className="space-y-1 text-center sm:text-left flex-1">
                      <h4 className="text-xs font-bold text-slate-900">
                        Student Profile Photo / የተማሪው ፎቶ <span className="text-rose-500">*</span>
                      </h4>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        Upload a clear photo of the student (JPG, PNG, WEBP — Max 5MB).
                      </p>
                      <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition">
                        <Upload className="h-3.5 w-3.5" />
                        <span>{photoUrl ? 'Change Photo / ፎቶ ቀይር' : 'Upload Photo / ፎቶ ጫን'}</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={handlePhotoSelect}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                </div>

                {/* Applicant National ID Front & Back Uploads (Required, 5MB each) */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <IdCard className="h-4 w-4 text-brand-600" />
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">
                        Applicant National ID or Passport / የተማሪው ብሔራዊ መታወቂያ ወይም ፓስፖርት <span className="text-rose-500">*</span>
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Upload both front and back images (JPG, PNG, WEBP — Max 5MB each).
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {/* Front Side */}
                    <div className="rounded-xl border border-slate-200 bg-white p-3 flex items-center gap-3">
                      <div className="relative flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50">
                        {applicantIdFront ? (
                          <img src={applicantIdFront} alt="ID Front" className="h-full w-full object-cover" />
                        ) : (
                          <IdCard className="h-6 w-6 text-slate-300" />
                        )}
                        {uploadingApplicantNidFront && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                            <Loader2 className="h-4 w-4 animate-spin text-white" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-800">
                          Front Side / የፊት ገጽ <span className="text-rose-500">*</span>
                        </p>
                        <p className="text-[10px] text-slate-400">Clear readable copy</p>
                        <label className="mt-1.5 inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">
                          <Upload className="h-3 w-3" />
                          <span>{applicantIdFront ? 'Replace' : 'Upload Front'}</span>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={(e) =>
                              handleImageUpload(
                                e.target.files?.[0],
                                setApplicantIdFront,
                                setUploadingApplicantNidFront
                              )
                            }
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>

                    {/* Back Side */}
                    <div className="rounded-xl border border-slate-200 bg-white p-3 flex items-center gap-3">
                      <div className="relative flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50">
                        {applicantIdBack ? (
                          <img src={applicantIdBack} alt="ID Back" className="h-full w-full object-cover" />
                        ) : (
                          <IdCard className="h-6 w-6 text-slate-300" />
                        )}
                        {uploadingApplicantNidBack && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                            <Loader2 className="h-4 w-4 animate-spin text-white" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-800">
                          Back Side / የኋላ ገጽ <span className="text-rose-500">*</span>
                        </p>
                        <p className="text-[10px] text-slate-400">Clear readable copy</p>
                        <label className="mt-1.5 inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">
                          <Upload className="h-3 w-3" />
                          <span>{applicantIdBack ? 'Replace' : 'Upload Back'}</span>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={(e) =>
                              handleImageUpload(
                                e.target.files?.[0],
                                setApplicantIdBack,
                                setUploadingApplicantNidBack
                              )
                            }
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Contact & Location */}
                <div>
                  <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
                    <Phone className="h-4 w-4 text-brand-600" />
                    <span>Contact & Location / አድራሻ እና ስልክ</span>
                  </h2>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Google Gmail Address / የጂሜይል አድራሻ <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                        <input
                          type="email"
                          required
                          placeholder="yourname@gmail.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Ethiopian Mobile Phone / የሞባይል ስልክ ቁጥር <span className="text-rose-500">*</span>
                      </label>
                      <div className="flex rounded-xl border border-slate-200 overflow-hidden focus-within:ring-2 focus-within:ring-brand-500">
                        <span className="inline-flex items-center gap-1 bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 select-none border-r border-slate-200 shrink-0">
                          <span>🇪🇹</span>
                          <span>+251</span>
                        </span>
                        <input
                          type="tel"
                          required
                          maxLength={9}
                          placeholder="912345678"
                          value={phoneDigits}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '').slice(0, 9);
                            setPhoneDigits(val);
                          }}
                          className="w-full px-3 py-2 text-sm font-mono text-slate-800 focus:outline-none"
                        />
                      </div>
                      <p className="mt-1 text-[10px] text-slate-400">
                        Start with 9 or 7 (e.g. 912345678) • Total 9 digits
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Region / ክልል <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={region}
                        onChange={(e) => setRegion(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      >
                        <option value="">Select Region / ክልል ይምረጡ</option>
                        {ETHIOPIAN_REGIONS.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.en} / {r.am}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        City or Town / ከተማ <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Harar"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Woreda or Kebele / ወረዳ ወይም ቀበሌ <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Woreda 03"
                        value={woreda}
                        onChange={(e) => setWoreda(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                  </div>

                  <div className="mt-3">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      House / Street Address / የቤት ወይም የመንገድ አድራሻ <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. House No. 452, Main Campus Area"
                      value={line}
                      onChange={(e) => setLine(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>

                {/* Step 1 Action */}
                <div className="pt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={handleProceedToStep2}
                    disabled={validatingStep1}
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50 transition"
                  >
                    {validatingStep1 ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Verifying Details... / መረጃው እየተረጋገጠ ነው...</span>
                      </>
                    ) : (
                      <>
                        <span>Continue to Step 2 / ወደ ደረጃ 2 ቀጥል</span>
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* ================= STEP 2: Academic & Emergency ================= */}
            {currentStep === 2 && (
              <div className="space-y-6 animate-fade">
                {/* Emergency Contact */}
                <div>
                  <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-brand-600" />
                    <span>Emergency Contact Information / የአስቸኳይ ጊዜ ተጠሪ</span>
                  </h2>

                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Contact Person Name / የተጠሪ ሙሉ ስም <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Muleta Ahmed"
                        value={emergencyName}
                        onChange={(e) => setEmergencyName(e.target.value.replace(/[^a-zA-Z\u1200-\u137F\s\-']/g, ''))}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Emergency Phone / የአስቸኳይ ጊዜ ስልክ <span className="text-rose-500">*</span>
                      </label>
                      <div className="flex rounded-xl border border-slate-200 overflow-hidden focus-within:ring-2 focus-within:ring-brand-500">
                        <span className="inline-flex items-center gap-1 bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 select-none border-r border-slate-200 shrink-0">
                          <span>🇪🇹</span>
                          <span>+251</span>
                        </span>
                        <input
                          type="tel"
                          required
                          maxLength={9}
                          placeholder="912345678"
                          value={emergencyPhoneDigits}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '').slice(0, 9);
                            setEmergencyPhoneDigits(val);
                          }}
                          className="w-full px-3 py-2 text-sm font-mono text-slate-800 focus:outline-none"
                        />
                      </div>
                      <p className="mt-1 text-[10px] text-slate-400">9 digits (e.g. 912345678)</p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Relationship / ዝምድና <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Father / Mother / እናት / አባት"
                        value={emergencyRel}
                        onChange={(e) => setEmergencyRel(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                  </div>

                  {/* Emergency Contact National ID Front & Back */}
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <IdCard className="h-4 w-4 text-brand-600" />
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">
                          Emergency Contact National ID / የተጠሪው ብሔራዊ መታወቂያ <span className="text-rose-500">*</span>
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          Upload front and back photos of the emergency contact's ID (Max 5MB each).
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      {/* Emg ID Front */}
                      <div className="rounded-xl border border-slate-200 bg-white p-3 flex items-center gap-3">
                        <div className="relative flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50">
                          {emergencyIdFront ? (
                            <img src={emergencyIdFront} alt="Emg ID Front" className="h-full w-full object-cover" />
                          ) : (
                            <IdCard className="h-6 w-6 text-slate-300" />
                          )}
                          {uploadingEmgNidFront && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                              <Loader2 className="h-4 w-4 animate-spin text-white" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-800">
                            Front Side / የፊት ገጽ <span className="text-rose-500">*</span>
                          </p>
                          <p className="text-[10px] text-slate-400">Clear readable copy</p>
                          <label className="mt-1.5 inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">
                            <Upload className="h-3 w-3" />
                            <span>{emergencyIdFront ? 'Replace' : 'Upload Front'}</span>
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              onChange={(e) =>
                                handleImageUpload(
                                  e.target.files?.[0],
                                  setEmergencyIdFront,
                                  setUploadingEmgNidFront
                                )
                              }
                              className="hidden"
                            />
                          </label>
                        </div>
                      </div>

                      {/* Emg ID Back */}
                      <div className="rounded-xl border border-slate-200 bg-white p-3 flex items-center gap-3">
                        <div className="relative flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50">
                          {emergencyIdBack ? (
                            <img src={emergencyIdBack} alt="Emg ID Back" className="h-full w-full object-cover" />
                          ) : (
                            <IdCard className="h-6 w-6 text-slate-300" />
                          )}
                          {uploadingEmgNidBack && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                              <Loader2 className="h-4 w-4 animate-spin text-white" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-800">
                            Back Side / የኋላ ገጽ <span className="text-rose-500">*</span>
                          </p>
                          <p className="text-[10px] text-slate-400">Clear readable copy</p>
                          <label className="mt-1.5 inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">
                            <Upload className="h-3 w-3" />
                            <span>{emergencyIdBack ? 'Replace' : 'Upload Back'}</span>
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              onChange={(e) =>
                                handleImageUpload(
                                  e.target.files?.[0],
                                  setEmergencyIdBack,
                                  setUploadingEmgNidBack
                                )
                              }
                              className="hidden"
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Academic Background */}
                <div>
                  <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-brand-600" />
                    <span>Previous Academic Background / የቀድሞ የትምህርት ደረጃ</span>
                  </h2>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Previous School / College Name / የቀድሞ ትምህርት ቤት <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Harar Senior Secondary School"
                        value={schoolName}
                        onChange={(e) => setSchoolName(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Year of Completion (E.C.) / የተመረቀበት ዓመት (ዓ.ም) <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={4}
                        placeholder="e.g. 2016"
                        value={completionYear}
                        onChange={(e) => setCompletionYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Step 2 Actions */}
                <div className="pt-4 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span>Back to Step 1 / ወደ ደረጃ 1 ተመለስ</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleProceedToStep3}
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-brand-700 transition"
                  >
                    <span>Continue to Step 3 / ወደ ደረጃ 3 ቀጥል</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* ================= STEP 3: Programme & Document Upload ================= */}
            {currentStep === 3 && (
              <div className="space-y-6 animate-fade">
                {/* 1. Qualification Selection & Cutoff Notice */}
                <div>
                  <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
                    <Award className="h-4 w-4 text-brand-600" />
                    <span>Select Qualification & Target Programme / የትምህርት ፕሮግራም ይምረጡ</span>
                  </h2>

                  <div className="mt-4 space-y-3">
                    <label className="block text-xs font-semibold text-slate-700">
                      Qualification Level / የትምህርት ደረጃ <span className="text-rose-500">*</span>
                    </label>
                    <div className="grid grid-cols-3 gap-2.5">
                      {[
                        { id: 'degree', labelEn: 'Degree', labelAm: 'ዲግሪ', cutoff: portal.entryPoints?.degree || 350 },
                        { id: 'diploma', labelEn: 'Diploma', labelAm: 'ዲፕሎማ', cutoff: portal.entryPoints?.diploma || 275 },
                        { id: 'short-term', labelEn: 'Short-Term', labelAm: 'አጭር ስልጠና', cutoff: portal.entryPoints?.shortTerm || 200 },
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setQualificationType(item.id)}
                          className={`rounded-2xl border p-3 text-left transition ${
                            qualificationType === item.id
                              ? 'border-brand-600 bg-brand-50/70 shadow-sm'
                              : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <p className={`text-xs font-bold ${qualificationType === item.id ? 'text-brand-900' : 'text-slate-800'}`}>
                            {item.labelEn} / {item.labelAm}
                          </p>
                          <p className="mt-1 text-[11px] font-semibold text-brand-700">
                            Min: ≥ {item.cutoff} pts
                          </p>
                        </button>
                      ))}
                    </div>

                    {/* Official Cutoff Notification Callout */}
                    <div className="rounded-2xl border border-brand-200 bg-brand-50/60 p-3.5 text-xs text-brand-900 flex items-start gap-2.5">
                      <Award className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">
                          Assigned {qualificationType.toUpperCase()} Minimum Cutoff: ≥ {currentCutoff} Points
                        </p>
                        <p className="mt-0.5 text-[11px] text-brand-700 leading-relaxed">
                          The College Registrar has assigned a minimum cutoff of {currentCutoff} points for this {qualificationType} programme. Please ensure your attached 12th grade certification meets or exceeds this score.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Department & Programme dropdowns (Dynamically filtered) */}
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Department / የትምህርት ክፍል <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={selectedDepartment}
                        onChange={(e) => setSelectedDepartment(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      >
                        {portal.departments?.length > 0 ? (
                          portal.departments.map((d) => (
                            <option key={d._id || d.id} value={d._id || d.id}>
                              {d.name} ({d.code})
                            </option>
                          ))
                        ) : (
                          <option value={portal.department}>{portal.department}</option>
                        )}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Programme of Study / የሚማሩት ፕሮግራም <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={selectedProgram}
                        onChange={(e) => setSelectedProgram(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      >
                        {availablePrograms.length > 0 ? (
                          availablePrograms.map((p) => (
                            <option key={p._id || p.id} value={p._id || p.id}>
                              {p.name} ({p.code})
                            </option>
                          ))
                        ) : (
                          <option value="">No programmes available for selected criteria</option>
                        )}
                      </select>
                    </div>
                  </div>
                </div>

                {/* 2. 12th Grade Result Certificate Document (PDF or Word, max 15MB) */}
                <div>
                  <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-brand-600" />
                    <span>Upload 12th Grade Result Certificate / የ12ኛ ክፍል ውጤት ሰነድ <span className="text-rose-500">*</span></span>
                  </h2>

                  <div className="mt-4">
                    <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/50 p-6 text-center hover:bg-slate-50 transition">
                      {certificateDoc ? (
                        <div className="flex flex-col items-center gap-2">
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
                            <FileCheck className="h-6 w-6" />
                          </div>
                          <p className="font-bold text-xs text-slate-800">{certificateDoc.fileName}</p>
                          <p className="text-[11px] text-slate-500">
                            {(certificateDoc.fileSize / (1024 * 1024)).toFixed(2)} MB • Ready to Submit / ዝግጁ ሆኗል
                          </p>
                          <button
                            type="button"
                            onClick={() => setCertificateDoc(null)}
                            className="mt-2 text-xs font-bold text-rose-600 hover:text-rose-700 underline"
                          >
                            Remove and upload a different document / ቀይር
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2">
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                            <Upload className="h-6 w-6" />
                          </div>
                          <h4 className="text-xs font-bold text-slate-800">
                            Attach Official 12th Grade Certificate / የ12ኛ ክፍል ሰርተፊኬት አያይዝ
                          </h4>
                          <p className="text-[11px] text-slate-500 max-w-sm leading-relaxed">
                            Upload your official Ethiopian 12th grade entrance exam results or educational certificate (PDF, DOC, DOCX — Max 15MB).
                          </p>
                          <label className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-800 transition">
                            <Upload className="h-3.5 w-3.5" />
                            <span>Select Document (PDF / Word) / ሰነድ ምረጥ</span>
                            <input
                              type="file"
                              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                              onChange={handleDocSelect}
                              className="hidden"
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Step 3 Actions */}
                <div className="pt-4 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(2)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span>Back to Step 2 / ወደ ደረጃ 2 ተመለስ</span>
                  </button>

                  <button
                    type="submit"
                    disabled={submitting || !certificateDoc || !selectedProgram}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Submitting Application... / ማመልከቻው እየገባ ነው...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Submit Official Application / ማመልከቻውን በይፋ አስገባ</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Video Tutorial Modal (Auto-opens on load if video available, with Skip button) */}
      {showVideoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fade">
          <div className="relative w-full max-w-3xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-4">
              <div className="flex items-center gap-2">
                <Video className="h-5 w-5 text-red-600" />
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">
                    Application Tutorial Video / የመመዝገቢያ አጋዥ ቪዲዮ
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Watch instructions before completing your application.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowVideoModal(false)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
                >
                  <span>Skip / ዝለል</span>
                  <X className="h-4 w-4 text-slate-500" />
                </button>
              </div>
            </div>

            <div className="aspect-video w-full bg-slate-900">
              <iframe
                src={embedUrl}
                title="Registration Tutorial Video"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full border-0"
              />
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setShowVideoModal(false)}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 transition"
              >
                <span>Continue to Form / ወደ ምዝገባው ቅጽ ሂድ</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
