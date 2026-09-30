import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const OTP_CHANNELS = ['email', 'whatsapp'] as const;
const E164_PHONE = /^\+[1-9]\d{7,14}$/;

export class SignupDto {
  @IsEmail({}, { message: 'Enter a valid email address.' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters.' })
  @MaxLength(128)
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  workspaceName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  workspaceSlug?: string;

  @IsOptional()
  @IsString()
  inviteToken?: string;
}

export class LoginDto {
  @IsString()
  @MaxLength(254)
  identifier: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;

  @IsIn(OTP_CHANNELS)
  channel: (typeof OTP_CHANNELS)[number];
}

export class VerifyLoginOtpDto {
  @IsString()
  @MaxLength(254)
  identifier: string;

  @IsIn(OTP_CHANNELS)
  channel: (typeof OTP_CHANNELS)[number];

  @IsString()
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit verification code.' })
  code: string;

  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}

export class FirebaseGoogleOAuthDto {
  @IsString()
  @MinLength(1)
  idToken: string;

  @IsOptional()
  @IsString()
  @Matches(/^(LOGIN|SIGNUP)$/)
  intent?: 'LOGIN' | 'SIGNUP';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Workspace name must be at least 2 characters.' })
  @MaxLength(120)
  workspaceName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Matches(/^[a-z0-9-]{2,40}$/, {
    message: 'Slug must be 2-40 lowercase letters, numbers, or hyphens.',
  })
  workspaceSlug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Matches(/^[a-z0-9-]{2,40}$/, {
    message: 'Workspace slug must be 2-40 lowercase letters, numbers, or hyphens.',
  })
  joinWorkspaceSlug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  inviteToken?: string;
}

export class AcceptInviteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  inviteToken: string;
}

export class RequestSignupOtpDto {
  @IsEmail({}, { message: 'Enter a valid email address.' })
  email: string;

  @IsIn(OTP_CHANNELS)
  channel: (typeof OTP_CHANNELS)[number];

  @IsOptional()
  @IsString()
  @Matches(E164_PHONE, { message: 'Use international format, for example +628123456789.' })
  phoneNumber?: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters.' })
  @MaxLength(128)
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Workspace name must be at least 2 characters.' })
  @MaxLength(120)
  workspaceName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Matches(/^[a-z0-9-]{2,40}$/, {
    message: 'Slug must be 2-40 lowercase letters, numbers, or hyphens.',
  })
  workspaceSlug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Matches(/^[a-z0-9-]{2,40}$/, {
    message: 'Workspace slug must be 2-40 lowercase letters, numbers, or hyphens.',
  })
  joinWorkspaceSlug?: string;
}

export class VerifySignupOtpDto {
  @IsEmail({}, { message: 'Enter a valid email address.' })
  email: string;

  @IsIn(OTP_CHANNELS)
  channel: (typeof OTP_CHANNELS)[number];

  @IsOptional()
  @IsString()
  @Matches(E164_PHONE, { message: 'Use international format, for example +628123456789.' })
  phoneNumber?: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit verification code.' })
  code: string;
}
