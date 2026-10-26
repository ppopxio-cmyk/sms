import mongoose from 'mongoose';

const { Schema } = mongoose;

export const MARK_COMPONENTS = [
  { key: 'assignment', label: 'Assignment' },
  { key: 'project', label: 'Project' },
  { key: 'quizzes', label: 'Quizzes' },
  { key: 'bonus', label: 'Bonus' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'presentation', label: 'Presentation' },
];

const courseMarkPolicySchema = new Schema(
  {
    offering: { type: Schema.Types.ObjectId, ref: 'CourseOffering', required: true, unique: true, index: true },
    teacher: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    weights: {
      assignment: { type: Number, min: 0, max: 100, default: 0 },
      project: { type: Number, min: 0, max: 100, default: 0 },
      assessments: { type: Number, min: 0, max: 100, default: 0 },
      quizzes: { type: Number, min: 0, max: 100, default: 0 },
      bonus: { type: Number, min: 0, max: 100, default: 0 },
      attendance: { type: Number, min: 0, max: 100, default: 0 },
      presentation: { type: Number, min: 0, max: 100, default: 0 },
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

courseMarkPolicySchema.pre('validate', function validateTotal() {
  if (this.weights && (!this.weights.assignment || this.weights.assignment === 0) && this.weights.assessments > 0) {
    this.weights.assignment = this.weights.assessments;
  }
  const total = MARK_COMPONENTS.reduce((sum, component) => sum + Number(this.weights?.[component.key] || 0), 0);
  if (Math.abs(total - 100) > 0.001) {
    this.invalidate('weights', 'The course mark policy must add up to exactly 100.');
  }
});

export const CourseMarkPolicy = mongoose.model('CourseMarkPolicy', courseMarkPolicySchema);
