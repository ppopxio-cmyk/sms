import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { toast } from 'sonner';
import Brand from '../../components/ui/Brand';
import { ETH_MONTHS, fromEthiopian, formatEthiopian } from '../../lib/ethiopianDate';

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

export default function PublicRegistrationPortal() {
  const { portalId } = useParams();

  const [loading, setLoading] = useState(true);
  const [portal, setPortal] = useState(null);
  const [notFound, setNotFound] = useState(false);

  // Stepper State (Step 1, 2, or 3)
  const [currentStep, setCurrentStep] = useState(1);

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
  const [phone, setPhone] = useState('');
  const [region, setRegion] = useState('');
  const [city, setCity] = useState('');
  const [woreda, setWoreda] = useState('');
  const [line, setLine] = useState('');

  // Student Photo (Max 5MB)
  const [photoUrl, setPhotoUrl] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Step 2: Emergency Contact & Academic Background
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [emergencyRel, setEmergencyRel] = useState('');
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

        // Auto-select initial department/program if available
        if (data.portal?.departments?.length > 0) {
          setSelectedDepartment(data.portal.departments[0]._id || data.portal.departments[0].id || '');
        }
        if (data.portal?.programs?.length > 0) {
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

  // Handle Photo Select (Personal student photo, not strict passport, max 5MB)
  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please choose a valid image file (PNG, JPG, WEBP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size must be under 5MB.');
      return;
    }

    setUploadingPhoto(true);
    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        setPhotoUrl(event.target.result);
        setUploadingPhoto(false);
        toast.success('Student photo uploaded.');
      };
      reader.readAsDataURL(file);
    } catch {
      toast.error('Failed to read image.');
      setUploadingPhoto(false);
    }
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
      toast.error('Only PDF and Word documents (.pdf, .doc, .docx) are accepted.');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      toast.error('Document size must be under 15MB.');
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
  const handleProceedToStep2 = () => {
    if (!firstName.trim() || !lastName.trim()) {
      toast.error('First and last name are required.');
      return;
    }
    if (!email.trim() || !/^[\w.%+-]+@gmail\.com$/i.test(email.trim())) {
      toast.error('A valid Google Gmail address (@gmail.com) is required.');
      return;
    }
    if (!phone.trim()) {
      toast.error('An Ethiopian mobile phone number is required.');
      return;
    }
    setCurrentStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Step 2 Validation & Proceed
  const handleProceedToStep3 = () => {
    if (!emergencyName.trim() || !emergencyPhone.trim()) {
      toast.error('Emergency contact name and phone number are required.');
      return;
    }
    if (!schoolName.trim()) {
      toast.error('Previous school or college name is required.');
      return;
    }
    setCurrentStep(3);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Step 3 Final Submit
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!certificateDoc) {
      toast.error('Please upload your 12th grade result certification document (PDF or Word, max 15MB).');
      return;
    }

    setSubmitting(true);
    try {
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
          phone: phone.trim(),
          address: {
            region: region.trim(),
            city: city.trim(),
            woreda: woreda.trim(),
            line: line.trim(),
          },
          emergencyContact: {
            name: emergencyName.trim(),
            phone: emergencyPhone.trim(),
            relationship: emergencyRel.trim(),
          },
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
      toast.success('Application submitted successfully!');
    } catch (err) {
      toast.error('Network error or file size limit. Please ensure document is within 15MB and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
          <p className="text-sm font-medium text-slate-500">Loading registration portal...</p>
        </div>
      </div>
    );
  }

  if (notFound || !portal) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <AlertCircle className="mx-auto h-12 w-12 text-slate-400" />
          <h1 className="mt-4 text-xl font-bold text-slate-800">Registration Portal Not Found</h1>
          <p className="mt-2 text-sm text-slate-500">
            This admission portal link does not exist, has expired, or is currently closed.
          </p>
          <div className="mt-6">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              Go to College Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Success Confirmation Screen
  if (applicationResult) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 print:bg-white print:p-0">
        <div className="mx-auto max-w-xl">
          <div className="mb-4 flex items-center justify-between print:hidden">
            <Link to="/login" className="text-xs font-medium text-slate-500 hover:text-slate-800">
              ← Return to Login
            </Link>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Printer className="h-4 w-4" />
              <span>Print Application Slip</span>
            </button>
          </div>

          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm print:border-none print:shadow-none">
            <div className="border-b border-emerald-100 bg-gradient-to-br from-emerald-600 to-teal-800 p-8 text-center text-white">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 shadow-inner backdrop-blur-sm">
                <CheckCircle2 className="h-10 w-10 text-white" />
              </div>
              <h1 className="mt-4 text-2xl font-black tracking-tight">Application Submitted Successfully!</h1>
              <p className="mt-1.5 text-xs text-emerald-100 max-w-md mx-auto leading-relaxed">
                The Registrar Office will review and approve your application in a few hours. We will communicate the admission decision and your official Student ID via your phone and email. Stay tuned!
              </p>
            </div>

            <div className="p-8 space-y-6">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 text-center">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800">
                  Tracking Reference Number
                </p>
                <p className="mt-1 font-mono text-2xl font-black text-emerald-900 tracking-wide">
                  {applicationResult.applicationNumber}
                </p>
                <p className="mt-1 text-xs text-emerald-700">
                  Keep this application number handy for verification and inquiries.
                </p>
              </div>

              <div className="space-y-3 divide-y divide-slate-100 text-sm">
                <div className="flex justify-between py-2">
                  <span className="text-slate-500">Applicant Full Name</span>
                  <span className="font-semibold text-slate-900">{applicationResult.fullName}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-slate-500">Registered Email</span>
                  <span className="font-mono text-xs text-slate-800">{applicationResult.email}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-slate-500">Phone Number</span>
                  <span className="font-mono text-xs text-slate-800">{applicationResult.phone}</span>
                </div>
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-xs text-emerald-900 space-y-2">
                <p className="font-bold text-sm text-emerald-950 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>Next Steps: Verification & Admission</span>
                </p>
                <p className="leading-relaxed">
                  1. The Registrar Office verifies your submitted 12th grade certification and personal information.
                </p>
                <p className="leading-relaxed">
                  2. Once approved, your official Student ID card and admission confirmation will be dispatched to your Gmail.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const embedUrl = getYouTubeEmbedUrl(portal.tutorialVideoUrl);

  // Filter programmes for the selected qualification type
  const availablePrograms = (portal.programs || []).filter((p) => {
    if (!p.qualificationType) return true;
    return p.qualificationType.toLowerCase() === qualificationType.toLowerCase();
  });

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
              <span>Watch Application Tutorial</span>
            </button>
          )}
        </div>

        {/* Portal Info Banner */}
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-gradient-to-r from-brand-600 to-indigo-700 p-6 text-white">
            <span className="inline-block rounded-lg bg-white/20 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider backdrop-blur-sm">
              Online Admission Portal
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
                { step: 1, label: '1. Personal & Contact' },
                { step: 2, label: '2. Academic & Emergency' },
                { step: 3, label: '3. Programme & Certificate' },
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
                  <span
                    className={`hidden sm:inline text-xs font-semibold ${
                      currentStep === item.step
                        ? 'text-brand-900 font-bold'
                        : currentStep > item.step
                          ? 'text-emerald-700'
                          : 'text-slate-400'
                    }`}
                  >
                    {item.label}
                  </span>
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
                    <span>Personal Information</span>
                  </h2>

                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        First Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Semir"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Father's Name (Middle)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Muleta"
                        value={middleName}
                        onChange={(e) => setMiddleName(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Grandfather's Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Ahmed"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Gender <span className="text-rose-500">*</span>
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
                          <span>Female</span>
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
                          <span>Male</span>
                        </label>
                      </div>
                    </div>

                    {/* Ethiopian Date of Birth */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Date of Birth (Ethiopian Calendar) <span className="text-rose-500">*</span>
                      </label>
                      <div className="grid grid-cols-3 gap-2 mt-1">
                        <input
                          type="number"
                          min="1970"
                          max="2015"
                          value={birthYear}
                          onChange={(e) => setBirthYear(e.target.value)}
                          placeholder="Year"
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
                          placeholder="Day"
                          className="rounded-xl border border-slate-200 px-2 py-2 text-xs text-center font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Student Photo Upload (Max 5MB, regular photo) */}
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
                    <div className="space-y-1 text-center sm:text-left">
                      <h4 className="text-xs font-bold text-slate-900">Student Profile Photo</h4>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        Upload a clear personal photo of the student (JPG, PNG, WEBP — Max 5MB).
                        Does not have to be a passport format.
                      </p>
                      <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition">
                        <Upload className="h-3.5 w-3.5" />
                        <span>{photoUrl ? 'Change Photo' : 'Upload Photo'}</span>
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

                {/* Contact & Location */}
                <div>
                  <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
                    <Phone className="h-4 w-4 text-brand-600" />
                    <span>Contact & Location</span>
                  </h2>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Google Gmail Address <span className="text-rose-500">*</span>
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
                        Ethiopian Mobile Phone <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                        <input
                          type="tel"
                          required
                          placeholder="+251 911 234 567"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-sm font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Region</label>
                      <input
                        type="text"
                        placeholder="e.g. Harari / Oromia"
                        value={region}
                        onChange={(e) => setRegion(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">City / Town</label>
                      <input
                        type="text"
                        placeholder="e.g. Harar"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Woreda / Kebele</label>
                      <input
                        type="text"
                        placeholder="e.g. Woreda 03"
                        value={woreda}
                        onChange={(e) => setWoreda(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Step 1 Action */}
                <div className="pt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={handleProceedToStep2}
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-brand-700 transition"
                  >
                    <span>Continue to Step 2: Academic & Emergency</span>
                    <ArrowRight className="h-4 w-4" />
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
                    <span>Emergency Contact Information</span>
                  </h2>

                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Contact Person Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Muleta Ahmed"
                        value={emergencyName}
                        onChange={(e) => setEmergencyName(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Emergency Phone Number <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="tel"
                        required
                        placeholder="+251 9..."
                        value={emergencyPhone}
                        onChange={(e) => setEmergencyPhone(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Relationship <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Father / Mother / Guardian"
                        value={emergencyRel}
                        onChange={(e) => setEmergencyRel(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Academic Background (Score/GPA removed as requested) */}
                <div>
                  <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-brand-600" />
                    <span>Previous Academic Background</span>
                  </h2>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Previous School / College Name <span className="text-rose-500">*</span>
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
                        Year of Completion (E.C.)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 2016"
                        value={completionYear}
                        onChange={(e) => setCompletionYear(e.target.value)}
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
                    <span>Back to Step 1</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleProceedToStep3}
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-brand-700 transition"
                  >
                    <span>Continue to Step 3: Programme & Certificate</span>
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
                    <span>Select Qualification & Target Programme</span>
                  </h2>

                  <div className="mt-4 space-y-3">
                    <label className="block text-xs font-semibold text-slate-700">
                      Qualification Level <span className="text-rose-500">*</span>
                    </label>
                    <div className="grid grid-cols-3 gap-2.5">
                      {[
                        { id: 'degree', label: 'Degree', cutoff: portal.entryPoints?.degree || 350 },
                        { id: 'diploma', label: 'Diploma', cutoff: portal.entryPoints?.diploma || 275 },
                        { id: 'short-term', label: 'Short-Term', cutoff: portal.entryPoints?.shortTerm || 200 },
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
                            {item.label}
                          </p>
                          <p className="mt-1 text-[11px] font-semibold text-brand-700">
                            Min. Cutoff: ≥ {item.cutoff} pts
                          </p>
                        </button>
                      ))}
                    </div>

                    {/* Official Cutoff Notification Callout */}
                    <div className="rounded-2xl border border-brand-200 bg-brand-50/60 p-3.5 text-xs text-brand-900 flex items-start gap-2.5">
                      <Award className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">
                          Assigned {qualificationType.toUpperCase()} Minimum Entry Cutoff: ≥ {currentCutoff} Points
                        </p>
                        <p className="mt-0.5 text-[11px] text-brand-700 leading-relaxed">
                          The College Registrar has assigned a minimum cutoff of {currentCutoff} points for this {qualificationType} programme. Please ensure your attached 12th grade certification meets or exceeds this score.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Department & Programme dropdowns */}
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Department <span className="text-rose-500">*</span>
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
                        Programme of Study <span className="text-rose-500">*</span>
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
                          <option value={portal.program}>{portal.program}</option>
                        )}
                      </select>
                    </div>
                  </div>
                </div>

                {/* 2. 12th Grade Result Certificate Document (PDF or Word, max 15MB) */}
                <div>
                  <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-brand-600" />
                    <span>Upload 12th Grade Result Certification Document</span>
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
                            {(certificateDoc.fileSize / (1024 * 1024)).toFixed(2)} MB • Document Ready
                          </p>
                          <button
                            type="button"
                            onClick={() => setCertificateDoc(null)}
                            className="mt-2 text-xs font-bold text-rose-600 hover:text-rose-700 underline"
                          >
                            Remove and upload a different document
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2">
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                            <Upload className="h-6 w-6" />
                          </div>
                          <h4 className="text-xs font-bold text-slate-800">
                            Attach Official 12th Grade Certificate
                          </h4>
                          <p className="text-[11px] text-slate-500 max-w-sm leading-relaxed">
                            Upload your official Ethiopian 12th grade entrance exam results or educational certificate (PDF, DOC, DOCX — Max 15MB).
                          </p>
                          <label className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-800 transition">
                            <Upload className="h-3.5 w-3.5" />
                            <span>Select Document (PDF / Word)</span>
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
                    <span>Back to Step 2</span>
                  </button>

                  <button
                    type="submit"
                    disabled={submitting || !certificateDoc}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Submitting Application...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Submit Official Application</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Video Tutorial Modal */}
      {showVideoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-3xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-4">
              <div className="flex items-center gap-2">
                <Video className="h-5 w-5 text-red-600" />
                <h3 className="font-bold text-slate-800">Application Video Tutorial</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowVideoModal(false)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
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
          </div>
        </div>
      )}
    </div>
  );
}
