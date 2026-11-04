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
  ShieldCheck,
  Building2,
  BookOpen,
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

  // Video Tutorial Modal
  const [showVideoModal, setShowVideoModal] = useState(false);

  // Form State
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gender, setGender] = useState('female');

  // Ethiopian Birth Date
  const currentEthYear = 2019;
  const [birthYear, setBirthYear] = useState('2000');
  const [birthMonth, setBirthMonth] = useState('1');
  const [birthDay, setBirthDay] = useState('1');

  // Contact
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [region, setRegion] = useState('');
  const [city, setCity] = useState('');
  const [woreda, setWoreda] = useState('');
  const [line, setLine] = useState('');

  // Emergency & Background
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [emergencyRel, setEmergencyRel] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [completionYear, setCompletionYear] = useState('');
  const [gradeOrGpa, setGradeOrGpa] = useState('');

  // Photo
  const [photoUrl, setPhotoUrl] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

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

  // Handle Photo Upload (via ImageKit endpoint or standard reader)
  const handlePhotoSelect = async (e) => {
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
      // Local preview / Data URL
      const reader = new FileReader();
      reader.onload = (event) => {
        setPhotoUrl(event.target.result);
        setUploadingPhoto(false);
      };
      reader.readAsDataURL(file);
    } catch {
      toast.error('Failed to read image.');
      setUploadingPhoto(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

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
            gradeOrGpa: gradeOrGpa.trim(),
          },
          photo: {
            url: photoUrl || null,
            status: photoUrl ? 'active' : 'missing',
          },
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
      toast.error('Network error. Please try again.');
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
            <div className="border-b border-emerald-100 bg-gradient-to-br from-emerald-500 to-teal-700 p-8 text-center text-white">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 shadow-inner backdrop-blur-sm">
                <CheckCircle2 className="h-10 w-10 text-white" />
              </div>
              <h1 className="mt-4 text-2xl font-black tracking-tight">Application Received!</h1>
              <p className="mt-1 text-sm text-emerald-100">
                Your admission application has been registered with the College Registrar.
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
                  Save this application number to check your status with the Registrar Office.
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
                <div className="flex justify-between py-2">
                  <span className="text-slate-500">Programme Applied</span>
                  <span className="font-medium text-slate-900">{portal.program}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-slate-500">Department</span>
                  <span className="font-medium text-slate-900">{portal.department}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-slate-500">Delivery Stream</span>
                  <span className="capitalize font-medium text-slate-900">{portal.category}</span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 space-y-1">
                <p className="font-semibold text-slate-800">What happens next?</p>
                <p>1. The Registrar Office will review your academic qualifications and uploaded photo.</p>
                <p>2. Once verified, an official Student ID will be issued and an admission confirmation will be sent to your Gmail.</p>
                <p>3. If you have any inquiries, contact the Registrar Office with your reference number.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const embedUrl = getYouTubeEmbedUrl(portal.tutorialVideoUrl);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-2xl">
        {/* Brand & Header */}
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
              Department of {portal.department} • {portal.program} ({portal.category.toUpperCase()})
            </p>
          </div>

          {portal.instructions && (
            <div className="border-b border-slate-100 bg-slate-50/70 p-5 text-xs text-slate-600 leading-relaxed">
              <p className="font-semibold text-slate-800 mb-1">Instructions for Applicants:</p>
              <p className="whitespace-pre-line">{portal.instructions}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-8">
            {/* 1. Identity & Name */}
            <div>
              <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
                <User className="h-4 w-4 text-brand-600" />
                <span>1. Personal Information</span>
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
                  <div className="grid grid-cols-3 gap-2">
                    <select
                      value={birthDay}
                      onChange={(e) => setBirthDay(e.target.value)}
                      className="rounded-xl border border-slate-200 px-2 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      {Array.from({ length: 30 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={d}>
                          Day {d}
                        </option>
                      ))}
                    </select>

                    <select
                      value={birthMonth}
                      onChange={(e) => setBirthMonth(e.target.value)}
                      className="rounded-xl border border-slate-200 px-2 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      {ETH_MONTHS.map((m, idx) => (
                        <option key={m} value={idx + 1}>
                          {idx + 1}. {m}
                        </option>
                      ))}
                    </select>

                    <select
                      value={birthYear}
                      onChange={(e) => setBirthYear(e.target.value)}
                      className="rounded-xl border border-slate-200 px-2 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      {Array.from({ length: 35 }, (_, i) => 2015 - i).map((y) => (
                        <option key={y} value={y}>
                          {y} E.C.
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Photo Upload (2x2 inch aspect ratio) */}
            <div>
              <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
                <Camera className="h-4 w-4 text-brand-600" />
                <span>2. Passport Photo (2 x 2 inches)</span>
              </h2>

              <div className="mt-4 flex flex-col sm:flex-row items-center gap-6">
                <div className="flex h-32 w-32 shrink-0 items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 overflow-hidden shadow-inner">
                  {photoUrl ? (
                    <img src={photoUrl} alt="Preview" className="h-full w-full object-cover" />
                  ) : (
                    <div className="text-center p-2 text-slate-400">
                      <Camera className="mx-auto h-8 w-8 text-slate-300" />
                      <span className="text-[10px] block mt-1">2 x 2 inches</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 cursor-pointer">
                    <Upload className="h-4 w-4 text-slate-500" />
                    <span>{photoUrl ? 'Replace Photo' : 'Upload Passport Photo'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoSelect}
                      className="hidden"
                    />
                  </label>
                  <p className="text-[11px] text-slate-500">
                    Standard square 2x2 passport-style photo with plain background. Required for student ID.
                  </p>
                </div>
              </div>
            </div>

            {/* 3. Contact & Address */}
            <div>
              <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
                <Phone className="h-4 w-4 text-brand-600" />
                <span>3. Contact & Location</span>
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
                  <p className="mt-1 text-[10px] text-slate-400">Must end in @gmail.com</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Mobile Phone Number <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="tel"
                      required
                      placeholder="0911223344 or +251 9..."
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Region</label>
                  <input
                    type="text"
                    placeholder="e.g. Oromia / Harari"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">City / Town</label>
                  <input
                    type="text"
                    placeholder="e.g. Harar / Haramaya"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Woreda / Kebele</label>
                  <input
                    type="text"
                    placeholder="e.g. 02"
                    value={woreda}
                    onChange={(e) => setWoreda(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>
            </div>

            {/* 4. Emergency & Education */}
            <div>
              <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-brand-600" />
                <span>4. Academic Background & Emergency Contact</span>
              </h2>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Previous School</label>
                  <input
                    type="text"
                    placeholder="High school or university"
                    value={schoolName}
                    onChange={(e) => setSchoolName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Completion Year</label>
                  <input
                    type="text"
                    placeholder="e.g. 2018 E.C."
                    value={completionYear}
                    onChange={(e) => setCompletionYear(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Score / GPA</label>
                  <input
                    type="text"
                    placeholder="e.g. 3.4 / 450"
                    value={gradeOrGpa}
                    onChange={(e) => setGradeOrGpa(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Emergency Contact Person</label>
                  <input
                    type="text"
                    placeholder="Full name"
                    value={emergencyName}
                    onChange={(e) => setEmergencyName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Relationship</label>
                  <input
                    type="text"
                    placeholder="e.g. Parent / Spouse"
                    value={emergencyRel}
                    onChange={(e) => setEmergencyRel(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Emergency Phone</label>
                  <input
                    type="tel"
                    placeholder="09..."
                    value={emergencyPhone}
                    onChange={(e) => setEmergencyPhone(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>
            </div>

            {/* Submission Button */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                By submitting, you certify that all entered credentials are correct and official.
              </p>

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-2xl bg-brand-600 px-6 py-3 text-sm font-bold text-white shadow-md hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Submitting Application...</span>
                  </>
                ) : (
                  <>
                    <span>Submit Application</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
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
