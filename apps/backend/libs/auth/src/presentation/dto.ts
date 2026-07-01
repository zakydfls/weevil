import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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
  @IsEmail({}, { message: 'Enter a valid email address.' })
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;
}

export class AcceptInviteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  inviteToken: string;
}
